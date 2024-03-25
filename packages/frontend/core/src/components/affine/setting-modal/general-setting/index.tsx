import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  AppearanceIcon,
  InformationIcon,
  KeyboardIcon,
} from '@blocksuite/icons';
import type { ReactElement, SVGProps } from 'react';

import { useCurrentLoginStatus } from '../../../../hooks/affine/use-current-login-status';
import { useServerFeatures } from '../../../../hooks/affine/use-server-config';
import type { GeneralSettingKey } from '../types';
import { AboutAffine } from './about';
import { AppearanceSettings } from './appearance';
import { BillingSettings } from './billing';
import { PaymentIcon, UpgradeIcon } from './icons';
import { AFFiNECloudPlans } from './plans';
import { Shortcuts } from './shortcuts';

interface GeneralSettingListItem {
  key: GeneralSettingKey;
  title: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
  testId: string;
}

export type GeneralSettingList = GeneralSettingListItem[];

export const useGeneralSettingList = (): GeneralSettingList => {
  const t = useAFFiNEI18N();
  const status = useCurrentLoginStatus();
  const { payment: hasPaymentFeature } = useServerFeatures();

  const settings: GeneralSettingListItem[] = [
    {
      key: 'appearance',
      title: t['com.affine.settings.appearance'](),
      icon: AppearanceIcon,
      testId: 'appearance-panel-trigger',
    },
    {
      key: 'shortcuts',
      title: t['com.affine.keyboardShortcuts.title'](),
      icon: KeyboardIcon,
      testId: 'shortcuts-panel-trigger',
    },
    {
      key: 'about',
      title: t['com.affine.aboutAFFiNE.title'](),
      icon: InformationIcon,
      testId: 'about-panel-trigger',
    },
  ];

  if (hasPaymentFeature) {
    settings.splice(3, 0, {
      key: 'plans',
      title: t['com.affine.payment.title'](),
      icon: UpgradeIcon,
      testId: 'plans-panel-trigger',
    });
    if (status === 'authenticated') {
      settings.splice(3, 0, {
        key: 'billing',
        title: t['com.affine.payment.billing-setting.title'](),
        icon: PaymentIcon,
        testId: 'billing-panel-trigger',
      });
    }
  }

  return settings;
};

interface GeneralSettingProps {
  generalKey: GeneralSettingKey;
}

export const GeneralSetting = ({ generalKey }: GeneralSettingProps) => {
  switch (generalKey) {
    case 'shortcuts':
      return <Shortcuts />;
    case 'appearance':
      return <AppearanceSettings />;
    case 'about':
      return <AboutAffine />;
    case 'plans':
      return <AFFiNECloudPlans />;
    case 'billing':
      return <BillingSettings />;
    default:
      return null;
  }
};
