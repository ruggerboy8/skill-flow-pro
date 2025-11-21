import { Outlet } from 'react-router-dom';

export default function CoachLayoutV2() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Coach Dashboard V2</h1>
      <Outlet />
    </div>
  );
}
