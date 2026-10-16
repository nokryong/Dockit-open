"use client";

import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

import WidgetRenderer from "../panel/WidgetRenderer";
import React from "react";
import { Div } from "sud-ui";
import { useSetting } from "../../context/SettingContext";
import ScrollReveal from "../common/ScrollReveal";

const SortableWidget = React.memo(function SortableWidget({ id, panelWidth }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 999 : "auto",
    opacity: isDragging ? 0 : 1
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="w-full">
      <WidgetRenderer id={id} dragHandleProps={listeners} width={panelWidth} />
    </div>
  );
});

const PanelContainer = React.memo(function PanelContainer({
  side,
  widgets,
  isDropTarget,
  variant
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: side
  });

  const { setting } = useSetting();
  const isWorkspaceSidebar = variant === "workspace-sidebar";

  return (
    <SortableContext
      id={side}
      items={widgets}
      strategy={verticalListSortingStrategy}
    >
      <Div
        ref={setNodeRef}
        className={`panel-${side} sticky top-0 flex overflow-y-auto h-full z-10 ${
          isWorkspaceSidebar
            ? "flex-col items-stretch gap-5 border-l border-zinc-200/80 p-5 dark:border-zinc-800"
            : `p-5 gap-5 ${
                side === "left"
                  ? "flex-col-reverse items-start" // 왼쪽: 아래부터 쌓고 위로 늘어남
                  : "flex-col items-end" // 오른쪽: 위부터 쌓고 아래로 늘어남
              }`
        }`}
        background={isOver && "white-8"}
      >
        {widgets.map((widgetId) => (
          <ScrollReveal key={widgetId} direction={side} delay={30}>
            <SortableWidget id={widgetId} panelWidth={"100%"} />
          </ScrollReveal>
        ))}
      </Div>
    </SortableContext>
  );
});

export default PanelContainer;
