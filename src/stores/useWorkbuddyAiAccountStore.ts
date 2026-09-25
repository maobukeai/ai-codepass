import {
  WorkbuddyAccount,
  getWorkbuddyAccountDisplayEmail,
  getWorkbuddyPlanBadge,
  getWorkbuddyUsage,
} from '../types/workbuddy';
import * as workbuddyAiService from '../services/workbuddyAiService';
import { getProviderCurrentAccountId } from '../services/providerCurrentAccountService';
import { createProviderAccountStore } from './createProviderAccountStore';

const WORKBUDDY_AI_ACCOUNTS_CACHE_KEY = 'agtools.workbuddy_ai.accounts.cache';
const WORKBUDDY_AI_CURRENT_ACCOUNT_ID_KEY = 'agtools.workbuddy_ai.current_account_id';

export const useWorkbuddyAiAccountStore = createProviderAccountStore<WorkbuddyAccount>(
  WORKBUDDY_AI_ACCOUNTS_CACHE_KEY,
  {
    listAccounts: workbuddyAiService.listWorkbuddyAiAccounts,
    deleteAccount: workbuddyAiService.deleteWorkbuddyAiAccount,
    deleteAccounts: workbuddyAiService.deleteWorkbuddyAiAccounts,
    injectAccount: async (accountId: string) => {
      await workbuddyAiService.injectWorkbuddyAiToClient(accountId);
      return '已切换到 WorkBuddy AI 客户端';
    },
    refreshToken: workbuddyAiService.refreshWorkbuddyAiToken,
    refreshAllTokens: async () => {
      const refreshed = await workbuddyAiService.refreshAllWorkbuddyAiTokens();
      return refreshed.length;
    },
    importFromJson: workbuddyAiService.importWorkbuddyAiFromJson,
    exportAccounts: async () => {
      return await workbuddyAiService.exportWorkbuddyAiAccounts();
    },
    updateAccountTags: workbuddyAiService.updateWorkbuddyAiAccountTags,
  },
  {
    getDisplayEmail: getWorkbuddyAccountDisplayEmail,
    getPlanBadge: getWorkbuddyPlanBadge,
    getUsage: getWorkbuddyUsage,
  },
  {
    platformId: 'workbuddy_ai',
    currentAccountIdKey: WORKBUDDY_AI_CURRENT_ACCOUNT_ID_KEY,
    resolveCurrentAccountId: () => getProviderCurrentAccountId('workbuddy_ai'),
  },
);
