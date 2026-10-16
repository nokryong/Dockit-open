import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, SoonUIDesign, Typography } from 'sud-ui';
import { TbDice1, TbDice2, TbDice3, TbDice4, TbDice5, TbDice6 } from 'react-icons/tb';
import 'sud-ui/dist/index.css';
import './style.css';

const sdk = window.Dockit;
const icons = [TbDice1, TbDice2, TbDice3, TbDice4, TbDice5, TbDice6];

function Dice() {
  const [theme, setTheme] = useState(sdk.theme);
  const [count, setCount] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [values, setValues] = useState(Array(10).fill(1));
  const [rolling, setRolling] = useState({});
  const [error, setError] = useState('');
  const timers = useRef(new Map());
  useEffect(() => sdk.onThemeChange(setTheme), []);
  useEffect(() => {
    let alive = true;
    sdk.storage.get('count').then(value => {
      if (alive) { if (Number.isInteger(value) && value >= 0 && value <= 10) setCount(value); setLoaded(true); }
    }).catch(failure => { if (alive) { setError(failure.message); setLoaded(true); } });
    const activeTimers = timers.current;
    return () => { alive = false; for (const { interval, timeout } of activeTimers.values()) { clearInterval(interval); clearTimeout(timeout); } };
  }, []);
  useEffect(() => sdk.onAction(id => {
    if (id === 'add') setCount(value => Math.min(10, value + 1));
    if (id === 'remove') setCount(value => Math.max(0, value - 1));
  }), []);
  useEffect(() => {
    sdk.setActions([
      { id: 'add', label: '주사위 추가', icon: 'plus', disabled: !loaded || count >= 10 },
      { id: 'remove', label: '주사위 줄이기', icon: 'minus', disabled: !loaded || count === 0 },
    ]).catch(failure => setError(failure.message));
    if (loaded) sdk.storage.set('count', count).catch(failure => setError(failure.message));
  }, [count, loaded]);

  const roll = index => {
    if (timers.current.has(index)) return;
    const randomize = () => setValues(previous => previous.map((value, i) => i === index ? Math.floor(Math.random() * 6) + 1 : value));
    setRolling(previous => ({ ...previous, [index]: true }));
    const interval = setInterval(randomize, 130);
    const timeout = setTimeout(() => {
      clearInterval(interval); randomize(); timers.current.delete(index);
      setRolling(previous => ({ ...previous, [index]: false }));
    }, 1500);
    timers.current.set(index, { interval, timeout });
  };
  const colors = { colors: theme.colors, body: { backgroundColor: 'transparent' } };
  return <SoonUIDesign theme={colors} darkTheme={colors} isDarkMode={theme.isDarkMode}>
    <div className="dice-body">
      {error && <div role="alert"><Typography size="sm" color="volcano">{error}</Typography></div>}
      {count === 0 && <Typography size="sm" color="cool-gray-7">주사위를 추가해서 사용하세요.</Typography>}
      <div className="dice-grid">
        {Array.from({ length: count }, (_, index) => {
          const Icon = icons[values[index] - 1];
          return <Button key={index} ariaLabel={`주사위 ${index + 1} 굴리기`} background={`${theme.name}-${rolling[index] ? 3 : 1}`} color={`${theme.name}-8`} border={false} icon={<Icon size={30} />} onClick={() => roll(index)} disabled={rolling[index] === true} />;
        })}
      </div>
    </div>
  </SoonUIDesign>;
}

sdk.ready.then(() => createRoot(document.getElementById('root')).render(<Dice />));
