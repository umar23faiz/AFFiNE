import { toast } from '@affine/component';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { EdgelessIcon, HistoryIcon, PageIcon } from '@blocksuite/icons';
import {
  Doc,
  PreconditionStrategy,
  registerAffineCommand,
  useLiveData,
  useService,
  Workspace,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { pageHistoryModalAtom } from '../../atoms/page-history';
import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';
import { useExportPage } from './use-export-page';
import { useTrashModalHelper } from './use-trash-modal-helper';

export function useRegisterBlocksuiteEditorCommands() {
  const page = useService(Doc);
  const pageId = page.id;
  const mode = useLiveData(page.mode$);
  const t = useAFFiNEI18N();
  const workspace = useService(Workspace);
  const docCollection = workspace.docCollection;
  const { getDocMeta } = useDocMetaHelper(docCollection);
  const currentPage = docCollection.getDoc(pageId);
  assertExists(currentPage);
  const pageMeta = getDocMeta(pageId);
  assertExists(pageMeta);
  const favorite = pageMeta.favorite ?? false;
  const trash = pageMeta.trash ?? false;

  const setPageHistoryModalState = useSetAtom(pageHistoryModalAtom);

  const openHistoryModal = useCallback(() => {
    setPageHistoryModalState(() => ({
      pageId,
      open: true,
    }));
  }, [pageId, setPageHistoryModalState]);

  const { toggleFavorite, restoreFromTrash, duplicate } =
    useBlockSuiteMetaHelper(docCollection);
  const exportHandler = useExportPage(currentPage);
  const { setTrashModal } = useTrashModalHelper(docCollection);
  const onClickDelete = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [pageMeta.title],
    });
  }, [pageId, pageMeta.title, setTrashModal]);

  const isCloudWorkspace = workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const preconditionStrategy = () =>
      PreconditionStrategy.InPaperOrEdgeless && !trash;

    // TODO: add back when edgeless presentation is ready

    // this is pretty hack and easy to break. need a better way to communicate with blocksuite editor
    // unsubs.push(
    //   registerAffineCommand({
    //     id: 'editor:edgeless-presentation-start',
    //     preconditionStrategy: () => PreconditionStrategy.InEdgeless && !trash,
    //     category: 'editor:edgeless',
    //     icon: <EdgelessIcon />,
    //     label: t['com.affine.cmdk.affine.editor.edgeless.presentation-start'](),
    //     run() {
    //       document
    //         .querySelector<HTMLElement>('edgeless-toolbar')
    //         ?.shadowRoot?.querySelector<HTMLElement>(
    //           '.edgeless-toolbar-left-part > edgeless-tool-icon-button:last-child'
    //         )
    //         ?.click();
    //     },
    //   })
    // );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-${favorite ? 'remove-from' : 'add-to'}-favourites`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add'](),
        run() {
          toggleFavorite(pageId);
          toast(
            favorite
              ? t['com.affine.cmdk.affine.editor.remove-from-favourites']()
              : t['com.affine.cmdk.affine.editor.add-to-favourites']()
          );
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-convert-to-${
          mode === 'page' ? 'edgeless' : 'page'
        }`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: `${t['Convert to ']()}${
          mode === 'page'
            ? t['com.affine.pageMode.edgeless']()
            : t['com.affine.pageMode.page']()
        }`,
        run() {
          page.toggleMode();
          toast(
            mode === 'page'
              ? t['com.affine.toastMessage.edgelessMode']()
              : t['com.affine.toastMessage.pageMode']()
          );
        },
      })
    );

    // todo: should not show duplicate for journal
    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-duplicate`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.header.option.duplicate'](),
        run() {
          duplicate(pageId);
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-pdf`,
        preconditionStrategy: () => mode === 'page' && !trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to PDF'](),
        async run() {
          await exportHandler('pdf');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-html`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to HTML'](),
        async run() {
          await exportHandler('html');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-png`,
        preconditionStrategy: () => mode === 'page' && !trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to PNG'](),
        async run() {
          await exportHandler('png');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-export-to-markdown`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['Export to Markdown'](),
        async run() {
          await exportHandler('markdown');
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-move-to-trash`,
        preconditionStrategy,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.moveToTrash.title'](),
        run() {
          onClickDelete();
        },
      })
    );

    unsubs.push(
      registerAffineCommand({
        id: `editor:${mode}-restore-from-trash`,
        preconditionStrategy: () =>
          PreconditionStrategy.InPaperOrEdgeless && trash,
        category: `editor:${mode}`,
        icon: mode === 'page' ? <PageIcon /> : <EdgelessIcon />,
        label: t['com.affine.cmdk.affine.editor.restore-from-trash'](),
        run() {
          restoreFromTrash(pageId);
        },
      })
    );

    if (runtimeConfig.enablePageHistory && isCloudWorkspace) {
      unsubs.push(
        registerAffineCommand({
          id: `editor:${mode}-page-history`,
          category: `editor:${mode}`,
          icon: <HistoryIcon />,
          label: t['com.affine.cmdk.affine.editor.reveal-page-history-modal'](),
          run() {
            openHistoryModal();
          },
        })
      );
    }

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [
    favorite,
    mode,
    onClickDelete,
    exportHandler,
    pageId,
    restoreFromTrash,
    t,
    toggleFavorite,
    trash,
    isCloudWorkspace,
    openHistoryModal,
    duplicate,
    page,
  ]);
}
