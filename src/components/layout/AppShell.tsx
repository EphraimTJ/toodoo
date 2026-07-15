import { Sidebar } from "./Sidebar";
import { ListPane } from "./ListPane";
import { DetailPane } from "./DetailPane";

export function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <ListPane />
      <DetailPane />
    </div>
  );
}
