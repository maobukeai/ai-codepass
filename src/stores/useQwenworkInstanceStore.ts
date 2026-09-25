import * as qwenworkInstanceService from '../services/qwenworkInstanceService';
import { createInstanceStore } from './createInstanceStore';

export const useQwenworkInstanceStore = createInstanceStore(
  qwenworkInstanceService,
  'agtools.qwenwork.instances.cache',
);
