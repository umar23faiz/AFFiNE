import type { BlockElement } from '@blocksuite/lit';
import type {
  AffineEditorContainer,
  EdgelessEditor,
  PageEditor,
} from '@blocksuite/presets';
import type { Doc } from '@blocksuite/store';
import { Slot } from '@blocksuite/store';
import type { PageMode } from '@toeverything/infra';
import clsx from 'clsx';
import type React from 'react';
import type { RefObject } from 'react';
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BlocksuiteDocEditor, BlocksuiteEdgelessEditor } from './lit-adaper';
import type { InlineRenderers } from './specs';
import * as styles from './styles.css';

// copy forwardSlot from blocksuite, but it seems we need to dispose the pipe
// after the component is unmounted right?
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function forwardSlot<T extends Record<string, Slot<any>>>(
  from: T,
  to: Partial<T>
) {
  Object.entries(from).forEach(([key, slot]) => {
    const target = to[key];
    if (target) {
      slot.pipe(target);
    }
  });
}

interface BlocksuiteEditorContainerProps {
  page: Doc;
  mode: PageMode;
  className?: string;
  style?: React.CSSProperties;
  defaultSelectedBlockId?: string;
  customRenderers?: InlineRenderers;
}

// mimic the interface of the webcomponent and expose slots & host
type BlocksuiteEditorContainerRef = Pick<
  (typeof AffineEditorContainer)['prototype'],
  'mode' | 'doc' | 'slots' | 'host'
> &
  HTMLDivElement;

function findBlockElementById(container: HTMLElement, blockId: string) {
  const element = container.querySelector(
    `[data-block-id="${blockId}"]`
  ) as BlockElement | null;
  return element;
}

// a workaround for returning the webcomponent for the given block id
// by iterating over the children of the rendered dom tree
const useBlockElementById = (
  containerRef: RefObject<HTMLElement | null>,
  blockId: string | undefined,
  timeout = 1000
) => {
  const [blockElement, setBlockElement] = useState<BlockElement | null>(null);
  useEffect(() => {
    if (!blockId) {
      return;
    }
    let canceled = false;
    const start = Date.now();
    function run() {
      if (canceled || !containerRef.current || !blockId) {
        return;
      }
      const element = findBlockElementById(containerRef.current, blockId);
      if (element) {
        setBlockElement(element);
      } else if (Date.now() - start < timeout) {
        setTimeout(run, 100);
      }
    }
    run();
    return () => {
      canceled = true;
    };
  }, [blockId, containerRef, timeout]);
  return blockElement;
};

export const BlocksuiteEditorContainer = forwardRef<
  AffineEditorContainer,
  BlocksuiteEditorContainerProps
>(function AffineEditorContainer(
  { page, mode, className, style, defaultSelectedBlockId, customRenderers },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PageEditor>(null);
  const edgelessRef = useRef<EdgelessEditor>(null);

  const slots: BlocksuiteEditorContainerRef['slots'] = useMemo(() => {
    return {
      docLinkClicked: new Slot(),
      editorModeSwitched: new Slot(),
      docUpdated: new Slot(),
      tagClicked: new Slot(),
    };
  }, []);

  // forward the slot to the webcomponent
  useLayoutEffect(() => {
    requestAnimationFrame(() => {
      const docPage = rootRef.current?.querySelector('affine-page-root');
      const edgelessPage = rootRef.current?.querySelector(
        'affine-edgeless-root'
      );
      if (docPage) {
        forwardSlot(docPage.slots, slots);
      }

      if (edgelessPage) {
        forwardSlot(edgelessPage.slots, slots);
      }
    });
  }, [page, slots]);

  useLayoutEffect(() => {
    slots.docUpdated.emit({ newDocId: page.id });
  }, [page, slots.docUpdated]);

  useLayoutEffect(() => {
    slots.editorModeSwitched.emit(mode);
  }, [mode, slots.editorModeSwitched]);

  /**
   * mimic an AffineEditorContainer using proxy
   */
  const affineEditorContainerProxy = useMemo(() => {
    const api = {
      slots,
      get page() {
        return page;
      },
      get doc() {
        return page;
      },
      get host() {
        return mode === 'page'
          ? docRef.current?.host
          : edgelessRef.current?.host;
      },
      get model() {
        return page.root as any;
      },
      get updateComplete() {
        return mode === 'page'
          ? docRef.current?.updateComplete
          : edgelessRef.current?.updateComplete;
      },
    };

    const proxy = new Proxy(api, {
      has(_, prop) {
        return (
          Reflect.has(api, prop) ||
          (rootRef.current ? Reflect.has(rootRef.current, prop) : false)
        );
      },
      get(_, prop) {
        if (Reflect.has(api, prop)) {
          return api[prop as keyof typeof api];
        }
        if (rootRef.current && Reflect.has(rootRef.current, prop)) {
          const maybeFn = Reflect.get(rootRef.current, prop);
          if (typeof maybeFn === 'function') {
            return maybeFn.bind(rootRef.current);
          } else {
            return maybeFn;
          }
        }
        return undefined;
      },
    }) as unknown as AffineEditorContainer;

    return proxy;
  }, [mode, page, slots]);

  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(affineEditorContainerProxy);
      } else {
        ref.current = affineEditorContainerProxy;
      }
    }
  }, [affineEditorContainerProxy, ref]);

  const blockElement = useBlockElementById(rootRef, defaultSelectedBlockId);

  useEffect(() => {
    if (blockElement) {
      affineEditorContainerProxy.updateComplete
        .then(() => {
          if (mode === 'page') {
            blockElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'center',
            });
          }
          const selectManager = affineEditorContainerProxy.host?.selection;
          if (!blockElement.path.length || !selectManager) {
            return;
          }
          const newSelection = selectManager.create('block', {
            path: blockElement.path,
          });
          selectManager.set([newSelection]);
        })
        .catch(console.error);
    }
  }, [blockElement, affineEditorContainerProxy, mode]);

  return (
    <div
      data-testid={`editor-${page.id}`}
      className={clsx(
        `editor-wrapper ${mode}-mode`,
        styles.docEditorRoot,
        className
      )}
      data-affine-editor-container
      style={style}
      ref={rootRef}
    >
      {mode === 'page' ? (
        <BlocksuiteDocEditor
          page={page}
          ref={docRef}
          customRenderers={customRenderers}
        />
      ) : (
        <BlocksuiteEdgelessEditor
          page={page}
          ref={edgelessRef}
          customRenderers={customRenderers}
        />
      )}
    </div>
  );
});
