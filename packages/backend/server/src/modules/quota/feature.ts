import { Injectable, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../../prisma';
import { CommonFeature, Feature, FeatureKind } from './types';

const Features: Feature[] = [
  {
    feature: 'early_access',
    type: FeatureKind.Feature,
    version: 1,
    configs: {
      whitelist: ['@toeverything.info'],
    },
  },
];

@Injectable()
export class FeatureService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    // upgrade features from lower version to higher version
    for (const feature of Features) {
      await this.upsertFeature(feature);
    }
  }

  // upgrade features from lower version to higher version
  async upsertFeature(feature: CommonFeature): Promise<void> {
    await this.prisma.userFeatures.upsert({
      where: {
        feature: feature.feature,
        version: {
          lt: feature.version,
        },
      },
      update: {
        version: feature.version,
        configs: feature.configs,
      },
      create: {
        feature: feature.feature,
        type: feature.type,
        version: feature.version,
        configs: feature.configs,
      },
    });
  }

  async getFeaturesVersion() {
    const features = await this.prisma.userFeatures.findMany({
      select: {
        feature: true,
        version: true,
      },
    });
    return features.reduce(
      (acc, feature) => {
        acc[feature.feature] = feature.version;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  async getFeature(feature: string) {
    return this.prisma.userFeatures.findUnique({
      where: {
        feature,
      },
    });
  }

  async getFeaturesByUser(userId: string) {
    const userFeatures = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        features: true,
      },
    });
    return userFeatures?.features;
  }

  async listFeatureUsers(feature: string) {
    return this.prisma.userFeatureGates
      .findMany({
        where: {
          feature: {
            feature: feature,
          },
        },
        select: {
          user: true,
        },
      })
      .then(users => users.map(user => user.user));
  }

  async hasFeature(userId: string, feature: string) {
    return this.prisma.userFeatureGates
      .count({
        where: {
          userId,
          feature: {
            feature,
          },
        },
      })
      .then(count => count > 0);
  }
}
