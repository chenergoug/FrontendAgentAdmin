import { Button, Input, Space } from 'antd';
import type { ReactNode } from 'react';

type TableToolbarProps = {
  keyword: string;
  onKeywordChange: (value: string) => void;
  children?: ReactNode;
  onReset: () => void;
  onSearch?: () => void;
};

export function TableToolbar({ keyword, onKeywordChange, children, onReset, onSearch }: TableToolbarProps) {
  return (
    <Space wrap className="toolbar">
      <Input.Search
        allowClear
        enterButton
        placeholder="请输入搜索内容"
        value={keyword}
        onChange={(event) => onKeywordChange(event.target.value)}
        onSearch={onSearch}
        style={{ width: 260 }}
      />
      {children}
      <Button onClick={onReset}>重置</Button>
    </Space>
  );
}
