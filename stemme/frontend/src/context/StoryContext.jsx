import { createContext, useCallback, useContext, useState } from "react";

const StoryContext = createContext(null);

export function StoryProvider({ children }) {
  const [items, setItems] = useState([]);

  const addItem = useCallback((item) => {
    setItems((prev) => [{ id: Date.now(), ...item }, ...prev]);
  }, []);

  return (
    <StoryContext.Provider value={{ items, addItem }}>
      {children}
    </StoryContext.Provider>
  );
}

export function useStory() {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStory must be used within StoryProvider");
  return ctx;
}
