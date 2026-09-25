import * as qoderCnInstanceService from '../services/qoderCnInstanceService';
import { createInstanceStore } from './createInstanceStore';

export const useQoderCnInstanceStore = createInstanceStore(
  qoderCnInstanceService,
  'agtools.qoder_cn.instances.cache',
);
