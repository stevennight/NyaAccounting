import {
  CATEGORY_IDS,
  type CategoryId,
  type PaymentChannel,
  type TransactionKind,
  type TransactionStatus,
} from './types';

export interface SubcategoryDefinition {
  id: string;
  label: string;
}

export interface CategoryDefinition {
  id: CategoryId;
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  subcategories: readonly SubcategoryDefinition[];
}

export const CATEGORY_DEFINITIONS: readonly CategoryDefinition[] = [
  {
    id: 'food',
    label: '吃喝',
    shortLabel: '吃喝',
    color: '#F97316',
    icon: 'restaurant',
    subcategories: [
      { id: 'dining', label: '正餐' },
      { id: 'groceries', label: '买菜' },
      { id: 'snacks_drinks', label: '零食饮料' },
      { id: 'delivery', label: '外卖' },
    ],
  },
  {
    id: 'digital',
    label: '数字与订阅',
    shortLabel: '订阅',
    color: '#2563EB',
    icon: 'laptop',
    subcategories: [
      { id: 'software', label: '软件' },
      { id: 'ai_services', label: 'AI 服务' },
      { id: 'cloud_services', label: '云服务' },
      { id: 'media_subscriptions', label: '影音会员' },
      { id: 'games', label: '游戏' },
      { id: 'devices', label: '电脑与设备' },
    ],
  },
  {
    id: 'transport',
    label: '交通',
    shortLabel: '交通',
    color: '#0D9488',
    icon: 'directions-car',
    subcategories: [
      { id: 'public_transport', label: '公共交通' },
      { id: 'taxi', label: '打车' },
      { id: 'fuel', label: '加油' },
      { id: 'parking', label: '停车' },
    ],
  },
  {
    id: 'daily',
    label: '日用购物',
    shortLabel: '日用',
    color: '#DB2777',
    icon: 'shopping-bag',
    subcategories: [
      { id: 'household', label: '日用品' },
      { id: 'clothing', label: '服饰' },
      { id: 'personal_care', label: '个护' },
    ],
  },
  {
    id: 'housing',
    label: '居住',
    shortLabel: '居住',
    color: '#7C3AED',
    icon: 'home',
    subcategories: [
      { id: 'rent', label: '房租' },
      { id: 'utilities', label: '水电燃气' },
      { id: 'maintenance', label: '维修' },
    ],
  },
  {
    id: 'health',
    label: '医疗健康',
    shortLabel: '健康',
    color: '#DC2626',
    icon: 'medical-services',
    subcategories: [
      { id: 'medical', label: '看病买药' },
      { id: 'fitness', label: '运动健身' },
      { id: 'insurance', label: '保险' },
    ],
  },
  {
    id: 'learning',
    label: '学习成长',
    shortLabel: '学习',
    color: '#CA8A04',
    icon: 'menu-book',
    subcategories: [
      { id: 'books', label: '书籍' },
      { id: 'courses', label: '课程' },
      { id: 'exams', label: '考试' },
    ],
  },
  {
    id: 'leisure',
    label: '休闲娱乐',
    shortLabel: '娱乐',
    color: '#16A34A',
    icon: 'sports-esports',
    subcategories: [
      { id: 'movies', label: '电影演出' },
      { id: 'hobbies', label: '兴趣爱好' },
      { id: 'activities', label: '休闲活动' },
    ],
  },
  {
    id: 'social',
    label: '人情社交',
    shortLabel: '社交',
    color: '#E11D48',
    icon: 'redeem',
    subcategories: [
      { id: 'gifts', label: '礼物' },
      { id: 'gatherings', label: '聚会' },
      { id: 'donations', label: '捐赠' },
    ],
  },
  {
    id: 'travel',
    label: '旅行',
    shortLabel: '旅行',
    color: '#0891B2',
    icon: 'flight',
    subcategories: [
      { id: 'lodging', label: '住宿' },
      { id: 'tickets', label: '票务' },
      { id: 'trip_spending', label: '旅途消费' },
    ],
  },
  {
    id: 'other',
    label: '其他',
    shortLabel: '其他',
    color: '#64748B',
    icon: 'more-horiz',
    subcategories: [],
  },
] as const;

const CATEGORY_MAP = new Map(
  CATEGORY_DEFINITIONS.map((category) => [category.id, category]),
);

export function isCategoryId(value: unknown): value is CategoryId {
  return (
    typeof value === 'string' &&
    (CATEGORY_IDS as readonly string[]).includes(value)
  );
}

export function getCategoryDefinition(
  categoryId: CategoryId,
): CategoryDefinition {
  return CATEGORY_MAP.get(categoryId) ?? CATEGORY_MAP.get('other')!;
}

export function isValidSubcategory(
  categoryId: CategoryId,
  subcategoryId: string | undefined,
): boolean {
  if (!subcategoryId) {
    return true;
  }

  return getCategoryDefinition(categoryId).subcategories.some(
    (subcategory) => subcategory.id === subcategoryId,
  );
}

export const TRANSACTION_KIND_LABELS: Record<TransactionKind, string> = {
  expense: '支出',
  refund: '退款',
  transfer: '转账',
  repayment: '还款',
  investment: '投资',
  top_up: '充值',
  income: '收入',
};

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  confirmed: '已确认',
  pending: '待处理',
  failed: '失败',
  cancelled: '已取消',
};

export const PAYMENT_CHANNEL_LABELS: Record<PaymentChannel, string> = {
  alipay: '支付宝',
  wechat_pay: '微信支付',
  unionpay: '云闪付',
  apple_pay: 'Apple Pay',
  bank_app: '银行 App',
  merchant_direct: '商户直付',
  cash: '现金',
  other: '其他',
  unknown: '未识别',
};
