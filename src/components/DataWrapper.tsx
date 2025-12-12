import React, { createContext, useState } from "react";

const DataContext = createContext({
  data: {
    name: "",
    age: 0,
  },
  setData: (data) => {},
});

const DataProvider = ({ children }) => {
  const [data, setData] = useState({ name: "John", age: 30 });

  return (
    <DataContext.Provider value={{ data, setData }}>
      {children}
    </DataContext.Provider>
  );
};

export { DataContext, DataProvider };
