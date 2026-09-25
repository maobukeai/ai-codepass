import {
  QoderAccount,
  getQoderAccountDisplayEmail,
  getQoderPlanBadge,
  getQoderUsage,
} from '../types/qoder';
import * as qoderCnService from '../services/qoderCnService';
import { getProviderCurrentAccountId } from '../services/providerCurrentAccountService';
import { createProviderAccountStore } from './createProviderAccountStore';

const QODER_CN_ACCOUNTS_CACHE_KEY = 'agtools.qoder_cn.accounts.cache';
const QODER_CN_CURRENT_ACCOUNT_ID_KEY = 'agtools.qoder_cn.current_account_id';

export const useQoderCnAccountStore = createProviderAccountStore<QoderAccount>(
  QODER_CN_ACCOUNTS_CACHE_KEY,
  {
    listAccounts: qoderCnService.listQoderAccounts,
    deleteAccount: qoderCnService.deleteQoderAccount,
    deleteAccounts: qoderCnService.deleteQoderAccounts,
    injectAccount: qoderCnService.injectQoderAccount,
    refreshToken: qoderCnService.refreshQoderToken,
    refreshAllTokens: qoderCnService.refreshAllQoderTokens,
    importFromJson: qoderCnService.importQoderFromJson,
    exportAccounts: qoderCnService.exportQoderAccounts,
    updateAccountTags: qoderCnService.updateQoderAccountTags,
  },
  {
    getDisplayEmail: getQoderAccountDisplayEmail,
    getPlanBadge: getQoderPlanBadge,
    getUsage: getQoderUsage,
  },
  {
    platformId: 'qoder_cn',
    currentAccountIdKey: QODER_CN_CURRENT_ACCOUNT_ID_KEY,
    resolveCurrentAccountId: () => getProviderCurrentAccountId('qoder_cn'),
  },
);
