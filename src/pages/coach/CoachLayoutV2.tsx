import { Outlet } from "react-router-dom";

export default function CoachLayoutV2() {
  return (
    <div className="space-y-6">
      <Outlet />
    </div>
  );
}
