import { lazy } from 'react';

export const NewWorkspaceSettingDetail = lazy(() =>
  import('../components/affine/new-workspace-setting-detail').then(
    ({ WorkspaceSettingDetail }) => ({
      default: WorkspaceSettingDetail,
    })
  )
);

export const PageDetailEditor = lazy(() =>
  import('../components/page-detail-editor').then(({ PageDetailEditor }) => ({
    default: PageDetailEditor,
  }))
);
