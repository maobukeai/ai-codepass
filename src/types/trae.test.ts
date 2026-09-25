import assert from 'node:assert/strict';
import test from 'node:test';
import { getTraeUsage, type TraeAccount } from './trae.ts';

test('getTraeUsage accurately parses Trae CN credits billing model (usage_summary + credit packs)', () => {
  const account: TraeAccount = {
    id: 'trae_d18100a3aa8144905698bad07a3c48e0',
    email: '83320233801',
    user_id: '1448515104171979',
    nickname: '用户83320233801',
    access_token: 'mock_token',
    plan_type: 'Free',
    created_at: 1788192000,
    last_used: 1790338000,
    trae_auth_raw: {
      platformId: 'trae_cn',
    },
    trae_entitlement_raw: {
      is_credits_billing: true,
      is_dollar_usage_billing: false,
      enable_solo_builder: true,
      user_pay_identity_str: 'Free',
    },
    trae_usage_raw: {
      _cockpit_source: 'user_current_entitlement_list',
      is_credits_billing: true,
      is_dollar_usage_billing: false,
      usage_summary: {
        consumed_amount: 2904.99,
        consumption_ratio: 0.5868666666666666,
        total_amount: 4950,
      },
      user_entitlement_pack_list: [
        {
          display_desc: '老用户福利',
          entitlement_base_info: {
            end_time: 1792375844,
            product_type: 2,
            quota: { credits_limit: 2000, no_bonus_quota: true },
          },
          is_hide: false,
          status: 0,
          usage: { credits_amount: 404.9888 },
        },
        {
          display_desc: '老用户福利',
          entitlement_base_info: {
            end_time: 1792375844,
            product_type: 2,
            quota: { credits_limit: 2000, no_bonus_quota: true },
          },
          is_hide: false,
          status: 0,
          usage: { credits_amount: 2000 },
        },
        {
          display_desc: '免费',
          entitlement_base_info: {
            end_time: 1790783999,
            product_type: 0,
            quota: {
              enable_solo_agent: true,
              solo_agent_parallel_limit: 2,
            },
          },
          is_hide: false,
          status: 1,
          usage: {},
        },
        {
          display_desc: '每月登录赠送',
          entitlement_base_info: {
            end_time: 1790783999,
            product_type: 2,
            quota: { credits_limit: 500, solo_agent_parallel_limit: 2 },
          },
          is_hide: false,
          status: 1,
          usage: { credits_amount: 500 },
        },
        {
          display_desc: '签到奖励',
          entitlement_base_info: {
            end_time: 1792572060,
            product_type: 2,
            quota: { credits_limit: 150 },
          },
          is_hide: false,
          status: 1,
          usage: {},
        },
        {
          display_desc: '签到奖励',
          entitlement_base_info: {
            end_time: 1792599131,
            product_type: 2,
            quota: { credits_limit: 150 },
          },
          is_hide: false,
          status: 1,
          usage: {},
        },
        {
          display_desc: '签到奖励',
          entitlement_base_info: {
            end_time: 1793010488,
            product_type: 2,
            quota: { credits_limit: 150 },
          },
          is_hide: false,
          status: 1,
          usage: {},
        },
      ],
    },
  };

  const usage = getTraeUsage(account);
  assert.equal(usage.usageModel, 'credits');
  assert.equal(usage.creditsTotal, 4950);
  assert.equal(usage.creditsUsed, 2904.99);
  assert.equal(usage.creditsAvailable, 2045.01);
  assert.equal(usage.creditsPackCount, 6);
  assert.equal(usage.usedPercent, 59);
  assert.equal(usage.usageExhausted, false);
  assert.equal(usage.soloParallelLimit, 2);
  assert.equal(usage.hasSoloPackage, true);
});
