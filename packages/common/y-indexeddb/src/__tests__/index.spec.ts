/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { setTimeout } from 'node:timers/promises';

import { AffineSchemas } from '@blocksuite/blocks/schemas';
import { assertExists } from '@blocksuite/global/utils';
import type { Doc } from '@blocksuite/store';
import { DocCollection, Schema } from '@blocksuite/store';
import { openDB } from 'idb';
import { nanoid } from 'nanoid';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import type { WorkspacePersist } from '../index';
import {
  createIndexedDBProvider,
  dbVersion,
  DEFAULT_DB_NAME,
  downloadBinary,
  getMilestones,
  markMilestone,
  overwriteBinary,
  revertUpdate,
  setMergeCount,
} from '../index';

function initEmptyPage(page: Doc) {
  const pageBlockId = page.addBlock(
    'affine:page' as keyof BlockSuite.BlockModels,
    {
      title: new page.Text(''),
    }
  );
  const surfaceBlockId = page.addBlock(
    'affine:surface' as keyof BlockSuite.BlockModels,
    {},
    pageBlockId
  );
  const frameBlockId = page.addBlock(
    'affine:note' as keyof BlockSuite.BlockModels,
    {},
    pageBlockId
  );
  const paragraphBlockId = page.addBlock(
    'affine:paragraph' as keyof BlockSuite.BlockModels,
    {},
    frameBlockId
  );
  return {
    pageBlockId,
    surfaceBlockId,
    frameBlockId,
    paragraphBlockId,
  };
}

async function getUpdates(id: string): Promise<Uint8Array[]> {
  const db = await openDB(rootDBName, dbVersion);
  const store = db
    .transaction('workspace', 'readonly')
    .objectStore('workspace');
  const data = (await store.get(id)) as WorkspacePersist | undefined;
  assertExists(data, 'data should not be undefined');
  expect(data.id).toBe(id);
  return data.updates.map(({ update }) => update);
}

let id: string;
let docCollection: DocCollection;
const rootDBName = DEFAULT_DB_NAME;

const schema = new Schema();

schema.register(AffineSchemas);

beforeEach(() => {
  id = nanoid();
  docCollection = new DocCollection({
    id,

    schema,
  });
  vi.useFakeTimers({ toFake: ['requestIdleCallback'] });
});

afterEach(() => {
  indexedDB.deleteDatabase('affine-local');
  localStorage.clear();
});

describe('indexeddb provider', () => {
  test('connect', async () => {
    const provider = createIndexedDBProvider(docCollection.doc);
    provider.connect();

    // todo: has a better way to know when data is synced
    await setTimeout(200);

    const db = await openDB(rootDBName, dbVersion);
    {
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = await store.get(id);
      expect(data).toEqual({
        id,
        updates: [
          {
            timestamp: expect.any(Number),
            update: encodeStateAsUpdate(docCollection.doc),
          },
        ],
      });
      const page = docCollection.createDoc({ id: 'page0' });
      page.load();
      const pageBlockId = page.addBlock(
        'affine:page' as keyof BlockSuite.BlockModels,
        {}
      );
      const frameId = page.addBlock(
        'affine:note' as keyof BlockSuite.BlockModels,
        {},
        pageBlockId
      );
      page.addBlock(
        'affine:paragraph' as keyof BlockSuite.BlockModels,
        {},
        frameId
      );
    }
    await setTimeout(200);
    {
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const data = (await store.get(id)) as WorkspacePersist | undefined;
      assertExists(data);
      expect(data.id).toBe(id);
      const testWorkspace = new DocCollection({
        id: 'test',
        schema,
      });
      // data should only contain updates for the root doc
      data.updates.forEach(({ update }) => {
        DocCollection.Y.applyUpdate(testWorkspace.doc, update);
      });
      const subPage = testWorkspace.doc.spaces.get('page0');
      {
        assertExists(subPage);
        await store.get(subPage.guid);
        const data = (await store.get(subPage.guid)) as
          | WorkspacePersist
          | undefined;
        assertExists(data);
        testWorkspace.getDoc('page0')?.load();
        data.updates.forEach(({ update }) => {
          DocCollection.Y.applyUpdate(subPage, update);
        });
      }
      expect(docCollection.doc.toJSON()).toEqual(testWorkspace.doc.toJSON());
    }
  });

  test('connect and disconnect', async () => {
    const provider = createIndexedDBProvider(docCollection.doc, rootDBName);
    provider.connect();
    expect(provider.connected).toBe(true);
    await setTimeout(200);
    const snapshot = encodeStateAsUpdate(docCollection.doc);
    provider.disconnect();
    expect(provider.connected).toBe(false);
    {
      const page = docCollection.createDoc({ id: 'page0' });
      page.load();
      const pageBlockId = page.addBlock(
        'affine:page' as keyof BlockSuite.BlockModels
      );
      const frameId = page.addBlock(
        'affine:note' as keyof BlockSuite.BlockModels,
        {},
        pageBlockId
      );
      page.addBlock(
        'affine:paragraph' as keyof BlockSuite.BlockModels,
        {},
        frameId
      );
    }
    {
      const updates = await getUpdates(docCollection.id);
      expect(updates.length).toBe(1);
      expect(updates[0]).toEqual(snapshot);
    }
    expect(provider.connected).toBe(false);
    provider.connect();
    expect(provider.connected).toBe(true);
    await setTimeout(200);
    {
      const updates = await getUpdates(docCollection.id);
      expect(updates).not.toEqual([]);
    }
    expect(provider.connected).toBe(true);
    provider.disconnect();
    expect(provider.connected).toBe(false);
  });

  test('cleanup', async () => {
    const provider = createIndexedDBProvider(docCollection.doc);
    provider.connect();
    await setTimeout(200);
    const db = await openDB(rootDBName, dbVersion);

    {
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const keys = await store.getAllKeys();
      expect(keys).contain(docCollection.id);
    }

    await provider.cleanup();
    provider.disconnect();

    {
      const store = db
        .transaction('workspace', 'readonly')
        .objectStore('workspace');
      const keys = await store.getAllKeys();
      expect(keys).not.contain(docCollection.id);
    }
  });

  test('merge', async () => {
    setMergeCount(5);
    const provider = createIndexedDBProvider(docCollection.doc, rootDBName);
    provider.connect();
    {
      const page = docCollection.createDoc({ id: 'page0' });
      page.load();
      const pageBlockId = page.addBlock(
        'affine:page' as keyof BlockSuite.BlockModels
      );
      const frameId = page.addBlock(
        'affine:note' as keyof BlockSuite.BlockModels,
        {},
        pageBlockId
      );
      for (let i = 0; i < 99; i++) {
        page.addBlock(
          'affine:paragraph' as keyof BlockSuite.BlockModels,
          {},
          frameId
        );
      }
    }
    await setTimeout(200);
    {
      const updates = await getUpdates(id);
      expect(updates.length).lessThanOrEqual(5);
    }
  });

  test("data won't be lost", async () => {
    const doc = new DocCollection.Y.Doc();
    const map = doc.getMap('map');
    for (let i = 0; i < 100; i++) {
      map.set(`${i}`, i);
    }
    {
      const provider = createIndexedDBProvider(doc, rootDBName);
      provider.connect();
      provider.disconnect();
    }
    {
      const newDoc = new DocCollection.Y.Doc();
      const provider = createIndexedDBProvider(newDoc, rootDBName);
      provider.connect();
      provider.disconnect();
      newDoc.getMap('map').forEach((value, key) => {
        expect(value).toBe(parseInt(key));
      });
    }
  });

  test('beforeunload', async () => {
    const oldAddEventListener = window.addEventListener;
    window.addEventListener = vi.fn((event: string, fn, options) => {
      expect(event).toBe('beforeunload');
      return oldAddEventListener(event, fn, options);
    });
    const oldRemoveEventListener = window.removeEventListener;
    window.removeEventListener = vi.fn((event: string, fn, options) => {
      expect(event).toBe('beforeunload');
      return oldRemoveEventListener(event, fn, options);
    });
    const doc = new YDoc({
      guid: '1',
    });
    const provider = createIndexedDBProvider(doc);
    const map = doc.getMap('map');
    map.set('1', 1);
    provider.connect();

    await setTimeout(200);

    expect(window.addEventListener).toBeCalledTimes(1);
    expect(window.removeEventListener).toBeCalledTimes(1);

    window.addEventListener = oldAddEventListener;
    window.removeEventListener = oldRemoveEventListener;
  });
});

describe('milestone', () => {
  test('milestone', async () => {
    const doc = new YDoc();
    const map = doc.getMap('map');
    const array = doc.getArray('array');
    map.set('1', 1);
    array.push([1]);
    await markMilestone('1', doc, 'test1');
    const milestones = await getMilestones('1');
    assertExists(milestones);
    expect(milestones).toBeDefined();
    expect(Object.keys(milestones).length).toBe(1);
    expect(milestones.test1).toBeInstanceOf(Uint8Array);
    const snapshot = new YDoc();
    applyUpdate(snapshot, milestones.test1);
    {
      const map = snapshot.getMap('map');
      expect(map.get('1')).toBe(1);
    }
    map.set('1', 2);
    {
      const map = snapshot.getMap('map');
      expect(map.get('1')).toBe(1);
    }
    revertUpdate(doc, milestones.test1, key =>
      key === 'map' ? 'Map' : 'Array'
    );
    {
      const map = doc.getMap('map');
      expect(map.get('1')).toBe(1);
    }

    const fn = vi.fn(() => true);
    doc.gcFilter = fn;
    expect(fn).toBeCalledTimes(0);

    for (let i = 0; i < 1e5; i++) {
      map.set(`${i}`, i + 1);
    }
    for (let i = 0; i < 1e5; i++) {
      map.delete(`${i}`);
    }
    for (let i = 0; i < 1e5; i++) {
      map.set(`${i}`, i - 1);
    }

    expect(fn).toBeCalled();

    const doc2 = new YDoc();
    applyUpdate(doc2, encodeStateAsUpdate(doc));

    revertUpdate(doc2, milestones.test1, key =>
      key === 'map' ? 'Map' : 'Array'
    );
    {
      const map = doc2.getMap('map');
      expect(map.get('1')).toBe(1);
    }
  });
});

describe('subDoc', () => {
  test('basic', async () => {
    let json1: any, json2: any;
    {
      const doc = new YDoc({
        guid: 'test',
      });
      const map = doc.getMap();
      const subDoc = new YDoc();
      subDoc.load();
      map.set('1', subDoc);
      map.set('2', 'test');
      const provider = createIndexedDBProvider(doc);
      provider.connect();
      await setTimeout(200);
      provider.disconnect();
      json1 = doc.toJSON();
    }
    {
      const doc = new YDoc({
        guid: 'test',
      });
      const provider = createIndexedDBProvider(doc);
      provider.connect();
      await setTimeout(200);
      const map = doc.getMap();
      const subDoc = map.get('1') as YDoc;
      subDoc.load();
      provider.disconnect();
      json2 = doc.toJSON();
    }
    // the following line compares {} with {}
    expect(json1['']['1'].toJSON()).toEqual(json2['']['1'].toJSON());
    expect(json1['']['2']).toEqual(json2['']['2']);
  });

  test('blocksuite', async () => {
    const page0 = docCollection.createDoc({
      id: 'page0',
    });
    page0.load();
    const { paragraphBlockId: paragraphBlockIdPage1 } = initEmptyPage(page0);
    const provider = createIndexedDBProvider(docCollection.doc, rootDBName);
    provider.connect();
    const page1 = docCollection.createDoc({
      id: 'page1',
    });
    page1.load();
    const { paragraphBlockId: paragraphBlockIdPage2 } = initEmptyPage(page1);
    await setTimeout(200);
    provider.disconnect();
    {
      const docCollection = new DocCollection({
        id,

        schema,
      });
      const provider = createIndexedDBProvider(docCollection.doc, rootDBName);
      provider.connect();
      await setTimeout(200);
      const page0 = docCollection.getDoc('page0') as Doc;
      page0.load();
      await setTimeout(200);
      {
        const block = page0.getBlockById(paragraphBlockIdPage1);
        assertExists(block);
      }
      const page1 = docCollection.getDoc('page1') as Doc;
      page1.load();
      await setTimeout(200);
      {
        const block = page1.getBlockById(paragraphBlockIdPage2);
        assertExists(block);
      }
    }
  });
});

describe('utils', () => {
  test('download binary', async () => {
    const page = docCollection.createDoc({ id: 'page0' });
    page.load();
    initEmptyPage(page);
    const provider = createIndexedDBProvider(docCollection.doc, rootDBName);
    provider.connect();
    await setTimeout(200);
    provider.disconnect();
    const update = (await downloadBinary(
      docCollection.id,
      rootDBName
    )) as Uint8Array;
    expect(update).toBeInstanceOf(Uint8Array);
    const newDocCollection = new DocCollection({
      id,

      schema,
    });
    applyUpdate(newDocCollection.doc, update);
    await setTimeout();
    expect(docCollection.doc.toJSON()['meta']).toEqual(
      newDocCollection.doc.toJSON()['meta']
    );
    expect(Object.keys(docCollection.doc.toJSON()['spaces'])).toEqual(
      Object.keys(newDocCollection.doc.toJSON()['spaces'])
    );
  });

  test('overwrite binary', async () => {
    const doc = new YDoc();
    const map = doc.getMap();
    map.set('1', 1);
    await overwriteBinary('test', new Uint8Array(encodeStateAsUpdate(doc)));
    {
      const binary = await downloadBinary('test');
      expect(binary).toEqual(new Uint8Array(encodeStateAsUpdate(doc)));
    }
  });
});
