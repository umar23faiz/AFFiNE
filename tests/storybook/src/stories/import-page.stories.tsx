/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { toast } from '@affine/component';
import { ImportPage } from '@affine/component/import-page';
import type { Meta, StoryFn } from '@storybook/react';

export default {
  title: 'AFFiNE/ImportPage',
  component: ImportPage,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta;

const Template: StoryFn<typeof ImportPage> = args => <ImportPage {...args} />;

export const Basic = Template.bind(undefined);
Basic.args = {
  importHtml: () => toast('Click importHtml'),
  importMarkdown: () => toast('Click importMarkdown'),
  importNotion: () => toast('Click importNotion'),
  onClose: () => toast('Click onClose'),
};
