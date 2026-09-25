import { useState, useMemo } from 'react';
import { useWorkbuddyAiAccountStore } from '../stores/useWorkbuddyAiAccountStore';
import * as workbuddyAiService from '../services/workbuddyAiService';
import {
  WorkbuddyAccount,
  getWorkbuddyAccountDisplayEmail,
  getWorkbuddyPlanBadge,
  getWorkbuddyUsage,
  getWorkbuddyQuotaCategoryGroups,
} from '../types/workbuddy';
import { useProviderAccountsPage } from '../hooks/useProviderAccountsPage';
import { CodebuddySuiteAccountsSharedView, type CodebuddySuiteAccountsPlatformConfig } from '../components/codebuddy-suite/CodebuddySuiteAccountsSharedView';
import { WorkbuddyAiCheckinModal } from '../components/codebuddy-suite/CodebuddySuiteCheckinModal';
import { PlatformOverviewTabsHeader, PlatformOverviewTab } from '../components/platform/PlatformOverviewTabsHeader';

const WORKBUDDY_AI_FLOW_NOTICE_COLLAPSED_KEY = 'agtools.workbuddy_ai.flow_notice_collapsed';
const WORKBUDDY_AI_CURRENT_ACCOUNT_ID_KEY = 'agtools.workbuddy_ai.current_account_id';

const workbuddyAiPlatformConfig: CodebuddySuiteAccountsPlatformConfig<WorkbuddyAccount> = {
  pageClassName: 'workbuddy-ai-accounts-page',
  quickSettingsType: 'workbuddy',
  searchPlaceholderKey: 'workbuddyAi.search',
  searchPlaceholderDefault: '搜索 WorkBuddy AI 账号...',
  flowNotice: {
    titleKey: 'workbuddyAi.flowNotice.title',
    titleDefault: 'WorkBuddy AI（国际版）账号管理说明（点击展开/收起）',
    descKey: 'workbuddyAi.flowNotice.desc',
    descDefault: '切换账号将自动回写 WorkBuddy AI 国际版官方客户端（workbuddy-desktop-ai.info），数据仅在本地处理。',
    permissionKey: 'workbuddyAi.flowNotice.permission',
    permissionDefault: '权限范围：读取/写入 WorkBuddy AI 本地凭据存储。',
    networkKey: 'workbuddyAi.flowNotice.network',
    networkDefault: '网络范围：OAuth 授权登录与 Token 刷新联网请求 WorkBuddy AI 国际服务（workbuddy.ai）。不上传本地凭证。',
  },
  noAccountsKey: 'workbuddyAi.noAccounts',
  noAccountsDefault: '暂无 WorkBuddy AI 账号',
  addAccountTitleKey: 'workbuddyAi.addAccount',
  addAccountTitleDefault: '添加 WorkBuddy AI 账号',
  oauthDescKey: 'workbuddyAi.oauthDesc',
  oauthDescDefault: '点击下方按钮将在浏览器中打开 WorkBuddy AI（workbuddy.ai）国际版授权页面。',
  oauthFeatureCardClassName: 'workbuddy-oauth-feature-card',
  oauthFeatureTitleKey: 'workbuddyAi.oauthFeature.oauth.title',
  oauthFeatureTitleDefault: '仅授权 IDE 登录信息',
  oauthFeatureItem1Key: 'workbuddyAi.oauthFeature.oauth.item1',
  oauthFeatureItem1Default: '在浏览器完成 OAuth 后即可添加账号并用于客户端切换。',
  oauthFeatureItem2Key: 'workbuddyAi.oauthFeature.oauth.item2',
  oauthFeatureItem2Default: '授权完成后会自动刷新国际版资源包配额数据。',
  oauthFeatureItem3Key: 'workbuddyAi.oauthFeature.oauth.item3',
  oauthFeatureItem3Default: '账号卡片将按资源包展示额度、进度和刷新/到期时间。',
  oauthUrlInputPlaceholderKey: 'workbuddyAi.oauthUrlInputPlaceholder',
  oauthUrlInputPlaceholderDefault: '可手动输入授权地址',
  oauthWaitingKey: 'workbuddyAi.oauthWaiting',
  oauthWaitingDefault: '等待国际版授权完成...',
  tokenDescKey: 'workbuddyAi.tokenDesc',
  tokenDescDefault: '粘贴 WorkBuddy AI 的 access token：',
  importLocalDescKey: 'workbuddyAi.import.localDesc',
  importLocalDescDefault: '支持从本机 WorkBuddy AI 客户端 (workbuddy-desktop-ai.info) 或 JSON 文件导入账号数据。',
  importLocalClientKey: 'workbuddyAi.import.localClient',
  importLocalClientDefault: '从本机 WorkBuddy AI 导入',
  getDisplayEmail: (account) => getWorkbuddyAccountDisplayEmail(account),
  getPlanBadge: (account) => getWorkbuddyPlanBadge(account),
  getUsage: (account) => getWorkbuddyUsage(account),
  getQuotaGroups: (account, t) => getWorkbuddyQuotaCategoryGroups(account, t),
  hasQuotaData: (_account, groups) => groups.some((g) => g.items.length > 0),
  usagePrefix: 'workbuddy',
  quotaPrefix: 'workbuddy',
  tableUsageClassName: 'workbuddy-table-usage',
  CheckinModal: WorkbuddyAiCheckinModal,
};

export function WorkbuddyAiAccountsPage() {
  const store = useWorkbuddyAiAccountStore();

  const oauthService = useMemo(
    () => ({
      startLogin: workbuddyAiService.startWorkbuddyAiOAuthLogin,
      completeLogin: workbuddyAiService.completeWorkbuddyAiOAuthLogin,
      cancelLogin: workbuddyAiService.cancelWorkbuddyAiOAuthLogin,
    }),
    [],
  );

  const dataService = useMemo(
    () => ({
      importFromJson: workbuddyAiService.importWorkbuddyAiFromJson,
      importFromLocal: workbuddyAiService.importWorkbuddyAiFromLocal,
      addWithToken: workbuddyAiService.addWorkbuddyAiAccountWithToken,
      exportAccounts: async () => {
        return await workbuddyAiService.exportWorkbuddyAiAccounts();
      },
      injectToVSCode: async (accountId: string) => {
        await workbuddyAiService.injectWorkbuddyAiToClient(accountId);
        return '已切换到 WorkBuddy AI 客户端';
      },
    }),
    [],
  );

  const page = useProviderAccountsPage<WorkbuddyAccount>({
    platformKey: 'WorkBuddy AI',
    oauthLogPrefix: 'WorkbuddyAiOAuth',
    flowNoticeCollapsedKey: WORKBUDDY_AI_FLOW_NOTICE_COLLAPSED_KEY,
    currentAccountIdKey: WORKBUDDY_AI_CURRENT_ACCOUNT_ID_KEY,
    exportFilePrefix: 'workbuddy_ai_accounts',
    oauthTabKeys: ['oauth'],
    store: {
      accounts: store.accounts,
      currentAccountId: store.currentAccountId,
      loading: store.loading,
      error: store.error,
      fetchAccounts: store.fetchAccounts,
      fetchCurrentAccountId: store.fetchCurrentAccountId,
      deleteAccounts: store.deleteAccounts,
      refreshToken: store.refreshToken,
      refreshAllTokens: store.refreshAllTokens,
      setCurrentAccountId: store.setCurrentAccountId,
      updateAccountTags: store.updateAccountTags,
    },
    oauthService,
    dataService,
    getDisplayEmail: (account) => getWorkbuddyAccountDisplayEmail(account),
  });

  const [activeTab, setActiveTab] = useState<PlatformOverviewTab>('overview');

  return (
    <div className={`ghcp-accounts-page ${workbuddyAiPlatformConfig.pageClassName}`}>
      <PlatformOverviewTabsHeader
        platform="workbuddy_ai"
        active={activeTab}
        onTabChange={setActiveTab}
        tabs={['overview']}
      />
      <CodebuddySuiteAccountsSharedView
        accounts={store.accounts}
        loading={store.loading}
        page={page}
        platformConfig={workbuddyAiPlatformConfig}
        onRefreshAccounts={() => { store.fetchAccounts(); }}
      />
    </div>
  );
}
