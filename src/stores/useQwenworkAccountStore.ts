import {
  QoderAccount,
  getQoderAccountDisplayEmail,
  getQoderPlanBadge,
  getQoderUsage,
} from '../types/qoder';
import * as qwenworkService from '../services/qwenworkService';
import { getProviderCurrentAccountId } from '../services/providerCurrentAccountService';
import { createProviderAccountStore } from './createProviderAccountStore';

const QWENWORK_ACCOUNTS_CACHE_KEY = 'agtools.qwenwork.accounts.cache';
const QWENWORK_CURRENT_ACCOUNT_ID_KEY = 'agtools.qwenwork.current_account_id';

export const useQwenworkAccountStore = createProviderAccountStore<QoderAccount>(
  QWENWORK_ACCOUNTS_CACHE_KEY,
  {
    listAccounts: qwenworkService.listQoderAccounts,
    deleteAccount: qwenworkService.deleteQoderAccount,
    deleteAccounts: qwenworkService.deleteQoderAccounts,
    injectAccount: qwenworkService.injectQoderAccount,
    refreshToken: qwenworkService.refreshQoderToken,
    refreshAllTokens: qwenworkService.refreshAllQoderTokens,
    importFromJson: qwenworkService.importQoderFromJson,
    exportAccounts: qwenworkService.exportQoderAccounts,
    updateAccountTags: qwenworkService.updateQoderAccountTags,
  },
  {
    getDisplayEmail: getQoderAccountDisplayEmail,
    getPlanBadge: getQoderPlanBadge,
    getUsage: getQoderUsage,
  },
  {
    platformId: 'qwenwork',
    currentAccountIdKey: QWENWORK_CURRENT_ACCOUNT_ID_KEY,
    resolveCurrentAccountId: () => getProviderCurrentAccountId('qwenwork'),
  },
);
