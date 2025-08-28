import * as React from "react";

export function Tabs({ value, onValueChange, children, className }) {
  const [current, setCurrent] = React.useState(value || "");
  React.useEffect(() => { setCurrent(value); }, [value]);
  function handleTabChange(val) {
    setCurrent(val);
    onValueChange && onValueChange(val);
  }
  let list, contents = [];
  React.Children.forEach(children, (child) => {
    if (!child) return;
    if (child.type.displayName === "TabsList") list = React.cloneElement(child, { current, onTab: handleTabChange });
    if (child.type.displayName === "TabsContent" && child.props.value === current) contents.push(child);
  });
  return (
    <div className={className || ""}>
      {list}
      <div>{contents}</div>
    </div>
  );
}
export function TabsList({ children, current, onTab, className }) {
  return (
    <div className={className || "flex gap-2 border-b"}>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { current, onTab })
      )}
    </div>
  );
}
TabsList.displayName = "TabsList";
export function TabsTrigger({ value, children, current, onTab, className }) {
  const selected = value === current;
  return (
    <button
      className={
        (className || "") +
        " px-6 py-2 font-bold rounded-t-lg border-b-2 " +
        (selected ? "border-blue-500 bg-white dark:bg-slate-900 shadow" : "border-transparent bg-transparent text-gray-500 hover:text-blue-600")
      }
      onClick={() => onTab(value)}
      type="button"
    >
      {children}
    </button>
  );
}
TabsTrigger.displayName = "TabsTrigger";
export function TabsContent({ value, children }) {
  return <div className="py-4">{children}</div>;
}
TabsContent.displayName = "TabsContent";
