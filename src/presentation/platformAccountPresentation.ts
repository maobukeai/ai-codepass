import type {
  CodebuddyAccount,
  CodebuddyOfficialQuotaResource,
} from '../types/codebuddy';
import type { QoderAccount, QoderSubscriptionInfo } from '../types/qoder';
import type { TraeAccount } from '../types/trae';
import type {
  WorkbuddyAccount,
  WorkbuddyOfficialQuotaResource,
} from '../types/workbuddy';
import {
  getCodebuddyAccountDisplayEmail,
  getCodebuddyOfficialQuotaModel,
  getCodebuddyPlanBadge,
  getCodebuddyUsage,
} from '../types/codebuddy';
import {
  getQoderAccountDisplayEmail,
  getQoderPlanBadge,
  getQoderSubscriptionInfo,
  shouldShowQoderSubscriptionReset,
} from '../types/qoder';
import {
  getTraeAccountDisplayName,
  getTraePlanBadge,
  getTraePlanBadgeClass,
  getTraeUsage,
} from '../types/trae';
import {
  getWorkbuddyAccountDisplayEmail,
  getWorkbuddyOfficialQuotaModel,
  getWorkbuddyPlanBadge,
  getWorkbuddyUsage,
} from '../types/workbuddy';

type Translate = (key: string, options?: any) => string;

export interface UnifiedQuotaMetric {
  key: string;
  label: string;
  percentage: number;
  quotaClass: string;
  valueText: string;
  resetText?: string;
  progressPercent?: number;
  showProgress?: boolean;
  resetAt?: string | number | null;
  used?: number;
  total?: number;
  left?: number;
}

export interface UnifiedAccountPresentation {
  id: string;
  displayName: string;
  planLabel: string;
  planClass: string;
  quotaItems: UnifiedQuotaMetric[];
  cycleText?: string;
  sublineText?: string;
  sublineClass?: string;
}

export interface QuotaPreviewLine {
  key: string;
  label: string;
  percentage: number;
  quotaClass: string;
  text: string;
  title: string;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
}

function formatQuotaNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '0';
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Math.max(0, value));
}

function formatUsdCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '$0.00';
  }
  return `$${value.toFixed(2)}`;
}

function getRemainingQuotaClass(percentage: number): string {
  if (percentage <= 10) return 'critical';
  if (percentage <= 30) return 'medium';
  return 'high';
}

function getCursorUsageQuotaClass(usedPercent: number): string {
  if (usedPercent >= 90) return 'critical';
  if (usedPercent >= 70) return 'medium';
  return 'high';
}

function resolveSimplePlanClass(planLabel: string): string {
  const normalized = planLabel.trim().toLowerCase();
  if (normalized.includes('pro') || normalized.includes('vip')) return 'pro';
  if (normalized.includes('team') || normalized.includes('enterprise')) return 'enterprise';
  return 'free';
}

function formatMetricResetText(timestamp: number | null | undefined, t: Translate): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '';
  const ms = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(ms);
  const diffDays = Math.ceil((ms - Date.now()) / (86400 * 1000));
  const countdown =
    diffDays > 0
      ? diffDays === 1
        ? ' (明天到期)'
        : ` (${diffDays}天后到期)`
      : diffDays === 0
        ? ' (今日到期)'
        : ' (已到期)';
  return t('common.expiresAt', {
    time: `${date.toLocaleDateString()}${countdown}`,
    defaultValue: `到期时间：${date.toLocaleDateString()}${countdown}`,
  });
}

function resolveCodebuddyResourceLabel(
  resource: CodebuddyOfficialQuotaResource,
  t: Translate,
): string {
  return resource.packageName || t('codebuddy.quota.resource', '资源包');
}

function resolveWorkbuddyResourceLabel(
  resource: WorkbuddyOfficialQuotaResource,
  t: Translate,
): string {
  return resource.packageName || t('workbuddy.quota.resource', '资源包');
}

function resolveResourceTimeText(
  resource: { cycleEndTime?: string | null; expiredTime?: string | null },
  _t: Translate,
  _updatedKey: string,
  _expireKey: string,
): string {
  if (resource.cycleEndTime) {
    return resource.cycleEndTime;
  }
  if (resource.expiredTime) {
    return resource.expiredTime;
  }
  return '';
}

function buildUsageStatusSubline(
  isNormal: boolean,
  t: Translate,
  normalKey: string,
  abnormalKey: string,
): { sublineText: string; sublineClass: string } {
  return {
    sublineText: isNormal ? t(normalKey, '正常') : t(abnormalKey, '异常'),
    sublineClass: isNormal ? 'normal' : 'abnormal',
  };
}

export function buildCodebuddyAccountPresentation(
  account: CodebuddyAccount,
  t: Translate,
): UnifiedAccountPresentation {
  const planLabel = getCodebuddyPlanBadge(account);
  const usage = getCodebuddyUsage(account);
  const model = getCodebuddyOfficialQuotaModel(account);
  const quotaItems: UnifiedQuotaMetric[] = [];
  const allResources = [...model.resources];
  if (model.extra.total > 0 || model.extra.remain > 0 || model.extra.used > 0) {
    allResources.push(model.extra);
  }

  allResources.forEach((resource, index) => {
    if (resource.total <= 0 && resource.remain <= 0) {
      return;
    }
    const remainPercent =
      resource.remainPercent ?? Math.max(0, 100 - resource.usedPercent);
    quotaItems.push({
      key: `resource_${index}`,
      label: resolveCodebuddyResourceLabel(resource, t),
      percentage: clampPercent(resource.usedPercent),
      progressPercent: clampPercent(resource.usedPercent),
      quotaClass: getRemainingQuotaClass(remainPercent),
      valueText: t('codebuddy.quota.usedOfTotal', {
        used: formatQuotaNumber(resource.used),
        total: formatQuotaNumber(resource.total),
        defaultValue: '{{used}} / {{total}}',
      }),
      resetText: resolveResourceTimeText(
        resource,
        t,
        'codebuddy.quotaQuery.updatedAt',
        'codebuddy.quotaQuery.expireAt',
      ),
      resetAt: resource.deductionEndTime ?? undefined,
      used: resource.used,
      total: resource.total,
      left: resource.remain,
      showProgress: true,
    });
  });

  return {
    id: account.id,
    displayName: getCodebuddyAccountDisplayEmail(account),
    planLabel,
    planClass: resolveSimplePlanClass(planLabel),
    quotaItems,
    ...buildUsageStatusSubline(
      usage.isNormal,
      t,
      'codebuddy.usageNormal',
      'codebuddy.usageAbnormal',
    ),
  };
}

export function buildWorkbuddyAccountPresentation(
  account: WorkbuddyAccount,
  t: Translate,
): UnifiedAccountPresentation {
  const planLabel = getWorkbuddyPlanBadge(account);
  const usage = getWorkbuddyUsage(account);
  const model = getWorkbuddyOfficialQuotaModel(account);
  const quotaItems: UnifiedQuotaMetric[] = [];
  const allResources = [...model.resources];
  if (model.extra.total > 0 || model.extra.remain > 0 || model.extra.used > 0) {
    allResources.push(model.extra);
  }

  allResources.forEach((resource, index) => {
    if (resource.total <= 0 && resource.remain <= 0) {
      return;
    }
    const remainPercent =
      resource.remainPercent ?? Math.max(0, 100 - resource.usedPercent);
    quotaItems.push({
      key: `resource_${index}`,
      label: resolveWorkbuddyResourceLabel(resource, t),
      percentage: clampPercent(resource.usedPercent),
      progressPercent: clampPercent(resource.usedPercent),
      quotaClass: getRemainingQuotaClass(remainPercent),
      valueText: t('workbuddy.quota.usedOfTotal', {
        used: formatQuotaNumber(resource.used),
        total: formatQuotaNumber(resource.total),
        defaultValue: '{{used}} / {{total}}',
      }),
      resetText: resolveResourceTimeText(
        resource,
        t,
        'workbuddy.quotaQuery.updatedAt',
        'workbuddy.quotaQuery.expireAt',
      ),
      resetAt: resource.deductionEndTime ?? undefined,
      used: resource.used,
      total: resource.total,
      left: resource.remain,
      showProgress: true,
    });
  });

  return {
    id: account.id,
    displayName: getWorkbuddyAccountDisplayEmail(account),
    planLabel,
    planClass: resolveSimplePlanClass(planLabel),
    quotaItems,
    ...buildUsageStatusSubline(
      usage.isNormal,
      t,
      'workbuddy.usageNormal',
      'workbuddy.usageAbnormal',
    ),
  };
}

export function buildQoderAccountPresentation(
  account: QoderAccount,
  t: Translate,
): UnifiedAccountPresentation {
  const subscription: QoderSubscriptionInfo = getQoderSubscriptionInfo(account);
  const planLabel = getQoderPlanBadge(account);
  const quotaItems: UnifiedQuotaMetric[] = [];

  const hasUserQuota = (subscription.userQuota.total ?? 0) > 0;
  const hasAddonQuota = (subscription.addOnQuota.total ?? 0) > 0;

  if (hasUserQuota || !hasAddonQuota) {
    const userRemaining =
      subscription.userQuota.remaining ??
      Math.max(0, (subscription.userQuota.total ?? 0) - (subscription.userQuota.used ?? 0));
    const userRemainingPercent =
      subscription.userQuota.total != null && subscription.userQuota.total > 0
        ? clampPercent((userRemaining / subscription.userQuota.total) * 100)
        : 0;
    const userUsedPercent = clampPercent(100 - userRemainingPercent);

    quotaItems.push({
      key: 'included',
      label: t('qoder.usageOverview.includedCredits', '套餐内 Credits'),
      percentage: userRemainingPercent,
      progressPercent: userRemainingPercent,
      quotaClass: getCursorUsageQuotaClass(userUsedPercent),
      valueText:
        subscription.userQuota.total != null && subscription.userQuota.total > 0
          ? `剩余 ${formatQuotaNumber(userRemaining)} / 总量 ${formatQuotaNumber(subscription.userQuota.total)}`
          : '0 / 0',
      resetText:
        subscription.userQuota.used != null || subscription.userQuota.total != null
          ? t('qoder.usageOverview.usedOfTotal', {
              used: formatQuotaNumber(subscription.userQuota.used),
              total: formatQuotaNumber(subscription.userQuota.total),
              defaultValue: '{{used}} / {{total}}',
            })
          : '',
      showProgress: true,
      used: subscription.userQuota.used ?? 0,
      total: subscription.userQuota.total ?? 0,
      left: userRemaining,
    });
  }

  if (hasAddonQuota) {
    const addonRemaining =
      subscription.addOnQuota.remaining ??
      Math.max(0, (subscription.addOnQuota.total ?? 0) - (subscription.addOnQuota.used ?? 0));
    const addonRemainingPercent =
      subscription.addOnQuota.total != null && subscription.addOnQuota.total > 0
        ? clampPercent((addonRemaining / subscription.addOnQuota.total) * 100)
        : 100;
    const addonUsedPercent = clampPercent(100 - addonRemainingPercent);

    quotaItems.push({
      key: 'creditPackage',
      label: t('common.shared.columns.creditPackage', '附加 Credits'),
      percentage: addonRemainingPercent,
      progressPercent: addonRemainingPercent,
      quotaClass: getCursorUsageQuotaClass(addonUsedPercent),
      valueText: `剩余 ${formatQuotaNumber(addonRemaining)} / 总量 ${formatQuotaNumber(subscription.addOnQuota.total)}`,
      resetText: '',
      showProgress: true,
      used: subscription.addOnQuota.used ?? 0,
      total: subscription.addOnQuota.total ?? 0,
      left: addonRemaining,
    });
  }

  if ((subscription.sharedCreditPackageUsed ?? 0) > 0) {
    quotaItems.push({
      key: 'sharedCreditPackage',
      label: t('common.shared.columns.sharedCreditPackage', '共享资源包'),
      percentage: 0,
      progressPercent: 0,
      quotaClass: 'high',
      valueText: formatQuotaNumber(subscription.sharedCreditPackageUsed),
      resetText: '',
      showProgress: false,
      used: subscription.sharedCreditPackageUsed ?? 0,
    });
  }

  return {
    id: account.id,
    displayName: getQoderAccountDisplayEmail(account),
    planLabel,
    planClass: resolveSimplePlanClass(planLabel),
    quotaItems,
    cycleText: shouldShowQoderSubscriptionReset(subscription)
      ? formatMetricResetText(subscription.expiresAt, t)
      : '',
  };
}

export function buildTraeAccountPresentation(
  account: TraeAccount,
  t: Translate,
): UnifiedAccountPresentation {
  const usage = getTraeUsage(account);
  const planLabel = getTraePlanBadge(account);
  const usedPercent =
    typeof usage.usedPercent === 'number' && Number.isFinite(usage.usedPercent)
      ? clampPercent(usage.usedPercent)
      : null;
  const remainingPercent = usedPercent == null ? null : clampPercent(100 - usedPercent);
  const quotaItems: UnifiedQuotaMetric[] = [];

  if (
    remainingPercent != null ||
    usage.creditsTotal != null ||
    usage.spentUsd != null ||
    usage.totalUsd != null ||
    usage.resetAt != null
  ) {
    quotaItems.push({
      key: 'usage',
      label: t('trae.columns.usage', 'Usage'),
      percentage: remainingPercent ?? 0,
      progressPercent: remainingPercent ?? 0,
      quotaClass: getCursorUsageQuotaClass(usedPercent ?? 0),
      valueText:
        remainingPercent == null
          ? '--'
          : t('common.shared.remaining', {
              value: `${remainingPercent}%`,
              defaultValue: '剩余 {{value}}',
            }),
      resetText:
        usage.usageModel === 'credits' &&
        usage.creditsUsed != null &&
        usage.creditsTotal != null
          ? t('trae.quota.creditsUsedOfTotal', {
              used: formatQuotaNumber(usage.creditsUsed),
              total: formatQuotaNumber(usage.creditsTotal),
              defaultValue: '已用 {{used}} / {{total}} 积分',
            })
          : usage.spentUsd != null && usage.totalUsd != null
            ? t('trae.quota.usedOfTotal', {
                used: formatQuotaNumber(usage.spentUsd),
                total: formatQuotaNumber(usage.totalUsd),
                defaultValue: '${{used}} / ${{total}}',
              })
            : formatMetricResetText(usage.resetAt, t),
      showProgress: true,
    });
  }

  if (usage.payAsYouGoOpen != null) {
    quotaItems.push({
      key: 'pay_as_you_go',
      label: t('trae.quota.payAsYouGoLabel', 'On-Demand Usage'),
      percentage: 0,
      progressPercent: 0,
      quotaClass: usage.payAsYouGoOpen ? 'high' : 'medium',
      valueText:
        usage.payAsYouGoUsd != null
          ? formatUsdCurrency(usage.payAsYouGoUsd)
          : usage.payAsYouGoOpen
            ? t('common.enabled', 'Enabled')
            : t('common.disabled', 'Disabled'),
      showProgress: false,
    });
  }

  return {
    id: account.id,
    displayName: getTraeAccountDisplayName(account),
    planLabel,
    planClass: getTraePlanBadgeClass(planLabel),
    quotaItems,
  };
}

export function buildQuotaPreviewLines(
  quotaItems: UnifiedQuotaMetric[],
  maxLines = 3,
): QuotaPreviewLine[] {
  return quotaItems.slice(0, maxLines).map((item) => ({
    key: item.key,
    label: item.label,
    percentage: item.percentage,
    quotaClass: item.quotaClass,
    text: item.valueText,
    title: item.resetText || '',
  }));
}
