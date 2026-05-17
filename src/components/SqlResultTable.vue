<template>
  <a-table
    class="sql-result-table"
    :columns="columns"
    :data-source="resultData"
    row-key="__rowKey"
    size="middle"
    :pagination="{ hideOnSinglePage: true, pageSize: 20 }"
  />
</template>

<script setup lang="ts">
import { computed, toRefs } from "vue";
import { QueryExecResult } from "sql.js";

interface SqlResultProps {
  result: QueryExecResult[];
}

const props = withDefaults(defineProps<SqlResultProps>(), {
  result: () => [],
});

// e.g. [{"columns":["a","b"],"values":[[0,"hello"],[1,"world"]]}]
const { result } = toRefs(props);

// 结果表格列头
const columns = computed(() => {
  if (result?.value?.[0]?.columns) {
    return result.value[0].columns.map((column) => {
      return {
        title: column,
        dataIndex: column,
      };
    });
  }
  return [];
});

// 结果表格数据
const resultData = computed(() => {
  if (!result?.value?.[0]?.values) {
    return [];
  }
  const tempColumns = result.value[0].columns;
  return result.value[0].values.map((originRow, rowIndex) => {
    const rowData: Record<string, any> = {
      __rowKey: rowIndex,
    };
    originRow.forEach((col, index) => {
      rowData[tempColumns[index]] = col;
    });
    return rowData;
  });
});
</script>

<style scoped>
.sql-result-table {
  overflow: hidden;
  border: 1px solid var(--sql-line);
  border-radius: 16px;
}

.sql-result-table :deep(.ant-table) {
  color: var(--sql-ink);
  background: rgba(255, 250, 240, 0.68);
}

.sql-result-table :deep(.ant-table-thead > tr > th) {
  border-bottom: 1px solid var(--sql-line);
  color: var(--sql-green);
  background: rgba(14, 111, 89, 0.08);
  font-weight: 900;
}

.sql-result-table :deep(.ant-table-tbody > tr > td) {
  border-bottom: 1px solid var(--sql-line);
}

.sql-result-table :deep(.ant-table-tbody > tr:hover > td) {
  background: rgba(246, 212, 145, 0.12);
}
</style>
