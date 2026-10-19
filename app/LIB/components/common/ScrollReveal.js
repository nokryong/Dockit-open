"use client";

import { useEffect, useRef, useState } from "react";

const getHiddenTransform = (direction, distance) => {
  switch (direction) {
    case "top":
      return `translateY(-${distance}px)`;
    case "bottom":
      return `translateY(${distance}px)`;
    case "left":
      return `translateX(-${distance}px)`;
    case "right":
      return `translateX(${distance}px)`;
    default:
      return `translateY(${distance}px)`;
  }
};

export default function ScrollReveal({
  children,
  delay = 100,
  duration = 600,
  direction = "bottom",
  distance = 24,
  threshold = 0.1,
  className = "",
  style = {}
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translate3d(0, 0, 0)" : getHiddenTransform(direction, distance),
        transition: `opacity ${duration}ms ease ${delay}ms, transform ${duration}ms ease ${delay}ms`,
        willChange: "opacity, transform",
        ...style
      }}
      className={`w-full ${className}`.trim()}
    >
      {children}
    </div>
  );
}
