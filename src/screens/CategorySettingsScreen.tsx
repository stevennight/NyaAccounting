import { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { IconButton } from '../components/IconButton';
import { InlineNotice } from '../components/InlineNotice';
import { PageHeader } from '../components/PageHeader';
import { Screen } from '../components/Screen';
import { SectionHeader } from '../components/SectionHeader';
import { CATEGORY_IDS } from '../domain/types';
import type {
  CategoryDefinition,
  SubcategoryDefinition,
} from '../domain/types';
import { createDomainId } from '../domain/normalize';
import { useHardwareBack } from '../hooks/useHardwareBack';
import { useAppStore } from '../store/AppStore';
import {
  AppTheme,
  categoryColors,
  radii,
  spacing,
  typography,
} from '../theme';

type CategorySettingsScreenProps = {
  theme: AppTheme;
  onBack: () => void;
};

type Notice = {
  tone: 'success' | 'warning' | 'danger';
  message: string;
};

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(
      Boolean(globalThis.confirm?.(`${title}\n\n${message}`)),
    );
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

function createCategory(index: number): CategoryDefinition {
  return {
    id: createDomainId('category'),
    label: '',
    shortLabel: '',
    color: categoryColors[index % categoryColors.length],
    icon: 'pricetag-outline',
    subcategories: [],
  };
}

export function CategorySettingsScreen({
  theme,
  onBack,
}: CategorySettingsScreenProps) {
  const { dataset, updateSettings } = useAppStore();
  const categories = dataset.settings.categories;
  const [form, setForm] = useState<CategoryDefinition | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const usedCategoryIds = useMemo(
    () =>
      new Set([
        dataset.settings.defaultCategoryId,
        ...Object.keys(dataset.settings.categoryBudgetsMinor),
        ...dataset.transactions.map((transaction) => transaction.categoryId),
        ...dataset.recurringExpenses.map((expense) => expense.categoryId),
      ]),
    [dataset],
  );
  const usedSubcategoryIds = useMemo(
    () =>
      new Set(
        [
          ...dataset.transactions.map(
            (transaction) => transaction.subcategoryId,
          ),
          ...dataset.recurringExpenses.map(
            (expense) => expense.subcategoryId,
          ),
        ].filter((value): value is string => Boolean(value)),
      ),
    [dataset.recurringExpenses, dataset.transactions],
  );

  const closeEditor = () => {
    setForm(null);
    setIsNew(false);
    setNotice(null);
  };

  useHardwareBack(() => {
    if (form) {
      closeEditor();
      return true;
    }
    onBack();
    return true;
  });

  const beginEdit = (category: CategoryDefinition) => {
    setForm({
      ...category,
      subcategories: category.subcategories.map((subcategory) => ({
        ...subcategory,
      })),
    });
    setIsNew(false);
    setNotice(null);
  };

  const beginCreate = () => {
    setForm(createCategory(categories.length));
    setIsNew(true);
    setNotice(null);
  };

  const updateSubcategory = (
    index: number,
    patch: Partial<SubcategoryDefinition>,
  ) => {
    setForm((current) =>
      current
        ? {
            ...current,
            subcategories: current.subcategories.map((subcategory, itemIndex) =>
              itemIndex === index
                ? { ...subcategory, ...patch }
                : subcategory,
            ),
          }
        : current,
    );
  };

  const addSubcategory = () => {
    setForm((current) =>
      current
        ? {
            ...current,
            subcategories: [
              ...current.subcategories,
              { id: createDomainId('subcategory'), label: '' },
            ],
          }
        : current,
    );
  };

  const removeSubcategory = (index: number) => {
    if (!form) {
      return;
    }
    const subcategory = form.subcategories[index];
    if (usedSubcategoryIds.has(subcategory.id)) {
      setNotice({
        tone: 'warning',
        message: '这个子分类已被账目或固定支出使用，不能删除；可以直接改名。',
      });
      return;
    }
    setForm({
      ...form,
      subcategories: form.subcategories.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    });
  };

  const saveCategory = async () => {
    if (!form) {
      return;
    }
    const label = form.label.trim();
    const shortLabel = form.shortLabel.trim() || label;
    const subcategories = form.subcategories.map((subcategory) => ({
      ...subcategory,
      label: subcategory.label.trim(),
    }));
    if (!label) {
      setNotice({ tone: 'danger', message: '请填写分类名称。' });
      return;
    }
    if (subcategories.some((subcategory) => !subcategory.label)) {
      setNotice({ tone: 'danger', message: '子分类名称不能为空。' });
      return;
    }
    const normalizedSubcategoryLabels = subcategories.map((subcategory) =>
      subcategory.label.normalize('NFKC').toLocaleLowerCase(),
    );
    if (new Set(normalizedSubcategoryLabels).size !== subcategories.length) {
      setNotice({ tone: 'danger', message: '同一分类下不能有重名的子分类。' });
      return;
    }
    const duplicateCategory = categories.some(
      (category) =>
        category.id !== form.id &&
        category.label.normalize('NFKC').toLocaleLowerCase() ===
          label.normalize('NFKC').toLocaleLowerCase(),
    );
    if (duplicateCategory) {
      setNotice({ tone: 'danger', message: '已经存在同名分类。' });
      return;
    }

    const nextCategory: CategoryDefinition = {
      ...form,
      label,
      shortLabel,
      subcategories,
    };
    const nextCategories = isNew
      ? [...categories, nextCategory]
      : categories.map((category) =>
          category.id === nextCategory.id ? nextCategory : category,
        );

    setSaving(true);
    setNotice(null);
    try {
      await updateSettings({ categories: nextCategories });
      closeEditor();
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : '分类设置保存失败。',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (category: CategoryDefinition) => {
    if ((CATEGORY_IDS as readonly string[]).includes(category.id)) {
      setNotice({
        tone: 'warning',
        message: '内置分类不能删除，但可以改名或调整子分类。',
      });
      return;
    }
    if (usedCategoryIds.has(category.id)) {
      setNotice({
        tone: 'warning',
        message: '这个分类已被账目、预算或固定支出使用，不能删除；可以直接改名。',
      });
      return;
    }
    const confirmed = await confirmAction(
      '删除分类',
      `确定删除“${category.label}”吗？`,
      '删除',
    );
    if (!confirmed) {
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      await updateSettings({
        categories: categories.filter((item) => item.id !== category.id),
      });
      closeEditor();
    } catch (error) {
      setNotice({
        tone: 'danger',
        message:
          error instanceof Error ? error.message : '分类删除失败。',
      });
    } finally {
      setSaving(false);
    }
  };

  if (form) {
    return (
      <Screen
        theme={theme}
        keyboard
        bottomNavigation={false}
        testID="category-editor-screen"
      >
        <PageHeader
          theme={theme}
          title={isNew ? '新增分类' : '编辑分类'}
          subtitle="名称会同步用于录入、统计和 AI 识别"
          onBack={closeEditor}
          backLabel="返回分类"
          backDisabled={saving}
        />

        {notice ? (
          <View style={styles.notice}>
            <InlineNotice
              theme={theme}
              tone={notice.tone}
              message={notice.message}
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeader title="分类" theme={theme} />
          <FormField
            theme={theme}
            label="分类名称"
            value={form.label}
            onChangeText={(label) => setForm({ ...form, label })}
            placeholder="例如：宠物"
            maxLength={100}
            testID="category-name"
          />
          <FormField
            theme={theme}
            label="短名称"
            value={form.shortLabel}
            onChangeText={(shortLabel) => setForm({ ...form, shortLabel })}
            placeholder="用于紧凑选项"
            maxLength={100}
            testID="category-short-name"
          />
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="子分类"
            subtitle={`${form.subcategories.length} 个`}
            theme={theme}
            action={
              <AppButton
                theme={theme}
                label="新增"
                icon="add"
                onPress={addSubcategory}
                variant="secondary"
                compact
                disabled={form.subcategories.length >= 100}
                testID="subcategory-add"
              />
            }
          />
          {form.subcategories.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>
              暂无子分类
            </Text>
          ) : (
            <View style={styles.subcategoryList}>
              {form.subcategories.map((subcategory, index) => (
                <View key={subcategory.id} style={styles.subcategoryRow}>
                  <View style={styles.subcategoryField}>
                    <FormField
                      theme={theme}
                      label={`子分类 ${index + 1}`}
                      value={subcategory.label}
                      onChangeText={(label) =>
                        updateSubcategory(index, { label })
                      }
                      maxLength={100}
                      testID={`subcategory-name-${index}`}
                    />
                  </View>
                  <IconButton
                    theme={theme}
                    icon="trash-outline"
                    label={`删除${subcategory.label || `子分类 ${index + 1}`}`}
                    onPress={() => removeSubcategory(index)}
                    disabled={saving}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <AppButton
            theme={theme}
            label="保存分类"
            icon="save-outline"
            onPress={() => void saveCategory()}
            loading={saving}
            testID="category-save"
          />
          {!isNew &&
          !(CATEGORY_IDS as readonly string[]).includes(form.id) ? (
            <AppButton
              theme={theme}
              label="删除分类"
              icon="trash-outline"
              onPress={() => void deleteCategory(form)}
              variant="danger"
              disabled={saving}
              testID="category-delete"
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      theme={theme}
      bottomNavigation={false}
      testID="category-settings-screen"
    >
      <PageHeader
        theme={theme}
        title="分类管理"
        subtitle="录入、统计和 AI 使用同一套分类"
        onBack={onBack}
        backLabel="返回设置"
      />

      {notice ? (
        <View style={styles.notice}>
          <InlineNotice
            theme={theme}
            tone={notice.tone}
            message={notice.message}
          />
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader
          title="分类"
          subtitle={`${categories.length} 个`}
          theme={theme}
          action={
            <AppButton
              theme={theme}
              label="新增"
              icon="add"
              onPress={beginCreate}
              variant="secondary"
              compact
              disabled={saving || categories.length >= 100}
              testID="category-add"
            />
          }
        />
        <View style={styles.categoryList}>
          {categories.map((category) => (
            <View
              key={category.id}
              style={[
                styles.categoryRow,
                {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.colorSwatch,
                  { backgroundColor: category.color },
                ]}
              />
              <View style={styles.categoryCopy}>
                <Text
                  style={[styles.categoryName, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  {category.label}
                </Text>
                <Text
                  style={[styles.categoryMeta, { color: theme.colors.textMuted }]}
                >
                  {category.subcategories.length > 0
                    ? `${category.subcategories.length} 个子分类`
                    : '未细分'}
                </Text>
              </View>
              <IconButton
                theme={theme}
                icon="create-outline"
                label={`编辑${category.label}`}
                onPress={() => beginEdit(category)}
                disabled={saving}
                testID={`category-edit-${category.id}`}
              />
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.xxl,
    gap: spacing.lg,
  },
  categoryList: {
    gap: spacing.sm,
  },
  categoryRow: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  colorSwatch: {
    width: 12,
    height: 36,
    borderRadius: radii.sm,
  },
  categoryCopy: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  categoryName: {
    fontSize: typography.body,
    fontWeight: '800',
  },
  categoryMeta: {
    fontSize: typography.caption,
  },
  emptyText: {
    fontSize: typography.body,
  },
  subcategoryList: {
    gap: spacing.md,
  },
  subcategoryRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  subcategoryField: {
    flex: 1,
    minWidth: 0,
  },
  actions: {
    gap: spacing.md,
  },
});
