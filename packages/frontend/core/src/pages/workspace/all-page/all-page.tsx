import {
  PageListHeader,
  useFilteredPageMetas,
  VirtualizedPageList,
} from '@affine/core/components/page-list';
import { useBlockSuiteDocMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { performanceRenderLogger } from '@affine/core/shared';
import type { Filter } from '@affine/env/filter';
import { useService, Workspace } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { ViewBodyIsland, ViewHeaderIsland } from '../../../modules/workbench';
import { EmptyPageList } from '../page-list-empty';
import * as styles from './all-page.css';
import { FilterContainer } from './all-page-filter';
import { AllPageHeader } from './all-page-header';

export const AllPage = () => {
  const currentWorkspace = useService(Workspace);
  const pageMetas = useBlockSuiteDocMeta(currentWorkspace.docCollection);
  const [hideHeaderCreateNew, setHideHeaderCreateNew] = useState(true);

  const [filters, setFilters] = useState<Filter[]>([]);
  const filteredPageMetas = useFilteredPageMetas(currentWorkspace, pageMetas, {
    filters: filters,
  });

  return (
    <>
      <ViewHeaderIsland>
        <AllPageHeader
          showCreateNew={!hideHeaderCreateNew}
          filters={filters}
          onChangeFilters={setFilters}
        />
      </ViewHeaderIsland>
      <ViewBodyIsland>
        <div className={styles.body}>
          <FilterContainer filters={filters} onChangeFilters={setFilters} />
          {filteredPageMetas.length > 0 ? (
            <VirtualizedPageList
              setHideHeaderCreateNewPage={setHideHeaderCreateNew}
              filters={filters}
            />
          ) : (
            <EmptyPageList
              type="all"
              heading={<PageListHeader />}
              docCollection={currentWorkspace.docCollection}
            />
          )}
        </div>
      </ViewBodyIsland>
    </>
  );
};

export const Component = () => {
  performanceRenderLogger.info('AllPage');

  const currentWorkspace = useService(Workspace);
  const navigateHelper = useNavigateHelper();

  useEffect(() => {
    function checkJumpOnce() {
      for (const [pageId] of currentWorkspace.docCollection.docs) {
        const page = currentWorkspace.docCollection.getDoc(pageId);
        if (page && page.meta?.jumpOnce) {
          currentWorkspace.docCollection.meta.setDocMeta(page.id, {
            jumpOnce: false,
          });
          navigateHelper.jumpToPage(currentWorkspace.id, pageId);
        }
      }
    }
    checkJumpOnce();
    return currentWorkspace.docCollection.slots.docUpdated.on(checkJumpOnce)
      .dispose;
  }, [currentWorkspace.docCollection, currentWorkspace.id, navigateHelper]);

  return <AllPage />;
};
