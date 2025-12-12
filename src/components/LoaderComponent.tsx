import { Text } from "ink";
import { useEffect, useState } from "react";

const LoaderComponent = ({ active }: { active: boolean }) => {
  const [i, setFrame] = useState(0);
  const [interval, editInterval] = useState(null);
  const frames = [`·  Pondering.  `, `•  Pondering.. `, `●  Pondering...`];

  useEffect(() => {
    if (active) {
      editInterval(
        setInterval(() => {
          setFrame((prevIndex) => (prevIndex + 1) % frames.length);
        }, 100)
      );
    } else {
      clearInterval(interval);
      editInterval(null);
    }
  }, [active]);

  return <Text>{frames[i]}</Text>;
};

export default LoaderComponent;
