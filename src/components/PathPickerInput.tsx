import { FolderOpenOutlined } from '@ant-design/icons';
import { Button, Input, Space } from 'antd';

type PathPickerInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder: string;
};

export function PathPickerInput({ value, onChange, placeholder }: PathPickerInputProps) {
  const selectPath = async () => {
    const selectedPath = await window.frontendAgent?.selectDirectory();
    if (selectedPath) onChange?.(selectedPath);
  };

  return (
    <Space.Compact block>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {window.frontendAgent?.selectDirectory && (
        <Button
          icon={<FolderOpenOutlined />}
          onClick={() => void selectPath()}
        >
          选择路径
        </Button>
      )}
    </Space.Compact>
  );
}
