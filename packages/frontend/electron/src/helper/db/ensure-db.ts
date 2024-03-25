import type { Subject } from 'rxjs';
import {
  concat,
  defer,
  from,
  fromEvent,
  interval,
  lastValueFrom,
  merge,
  Observable,
} from 'rxjs';
import {
  concatMap,
  distinctUntilChanged,
  filter,
  ignoreElements,
  last,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs/operators';

import { logger } from '../logger';
import { getWorkspaceMeta } from '../workspace/meta';
import { workspaceSubjects } from '../workspace/subjects';
import { SecondaryWorkspaceSQLiteDB } from './secondary-db';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

// export for testing
export const db$Map = new Map<string, Observable<WorkspaceSQLiteDB>>();

// use defer to prevent `app` is undefined while running tests
const beforeQuit$ = defer(() => fromEvent(process, 'beforeExit'));

// return a stream that emit a single event when the subject completes
function completed<T>(subject$: Subject<T>) {
  return new Observable(subscriber => {
    const sub = subject$.subscribe({
      complete: () => {
        subscriber.next();
        subscriber.complete();
      },
    });
    return () => sub.unsubscribe();
  });
}

function getWorkspaceDB(id: string) {
  if (!db$Map.has(id)) {
    db$Map.set(
      id,
      from(openWorkspaceDatabase(id)).pipe(
        tap({
          next: db => {
            logger.info(
              '[ensureSQLiteDB] db connection established',
              db.workspaceId
            );
          },
        }),
        switchMap(db =>
          // takeUntil the polling stream, and then destroy the db
          concat(
            startPollingSecondaryDB(db).pipe(
              ignoreElements(),
              startWith(db),
              takeUntil(merge(beforeQuit$, completed(db.update$))),
              last(),
              tap({
                next() {
                  logger.info(
                    '[ensureSQLiteDB] polling secondary db complete',
                    db.workspaceId
                  );
                },
              })
            ),
            defer(async () => {
              try {
                await db.destroy();
                db$Map.delete(id);
                return db;
              } catch (err) {
                logger.error('[ensureSQLiteDB] destroy db failed', err);
                throw err;
              }
            })
          ).pipe(startWith(db))
        ),
        shareReplay(1)
      )
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return db$Map.get(id)!;
}

function startPollingSecondaryDB(db: WorkspaceSQLiteDB) {
  return merge(
    getWorkspaceMeta(db.workspaceId),
    workspaceSubjects.meta$.pipe(
      map(({ meta }) => meta),
      filter(meta => meta.id === db.workspaceId)
    )
  ).pipe(
    map(meta => meta?.secondaryDBPath),
    filter((p): p is string => !!p),
    distinctUntilChanged(),
    switchMap(path => {
      // on secondary db path change, destroy the old db and create a new one
      const secondaryDB = new SecondaryWorkspaceSQLiteDB(path, db);
      return new Observable<SecondaryWorkspaceSQLiteDB>(subscriber => {
        subscriber.next(secondaryDB);
        return () => {
          secondaryDB.destroy().catch(err => {
            subscriber.error(err);
          });
        };
      });
    }),
    switchMap(secondaryDB => {
      return interval(300000).pipe(
        startWith(0),
        concatMap(() => secondaryDB.pull()),
        tap({
          error: err => {
            logger.error(`[ensureSQLiteDB] polling secondary db error`, err);
          },
          complete: () => {
            logger.info('[ensureSQLiteDB] polling secondary db complete');
          },
        })
      );
    })
  );
}

export function ensureSQLiteDB(id: string) {
  return lastValueFrom(getWorkspaceDB(id).pipe(take(1)));
}
