import { Card, Result } from 'antd';

export function LockedProject() {
  return (
    <Card>
      <Result
        status="warning"
        title="子客户端已被主客户端关闭"
        subTitle="当前页面已锁定，请从主客户端项目中心重新打开该项目后继续操作。"
      />
    </Card>
  );
}
