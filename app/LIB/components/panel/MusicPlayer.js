import { useEffect, useRef, useState } from "react";
import { Button, Typography } from "sud-ui";
import { BsMusicPlayerFill } from "react-icons/bs";
import { useMusic } from "../../context/MusicContext";
import WidgetCard from "./WidgetCard";

export default function MusicPlayer({ dragHandleProps }) {
  const { musicList, loading, error, addMusic, removeMusic } = useMusic();
  const [selected, setSelected] = useState(null);
  const [repeat, setRepeat] = useState(false);
  const [playError, setPlayError] = useState("");
  const audio = useRef(null);
  const track = musicList.find(item => item._id === selected);
  useEffect(() => {
    if (track && audio.current) {
      setPlayError("");
      audio.current.play().catch(() => setPlayError("재생 버튼을 눌러 주세요."));
    }
  }, [track]);
  const next = () => {
    const index = musicList.findIndex(item => item._id === selected);
    if (index + 1 < musicList.length) setSelected(musicList[index + 1]._id);
  };
  return <WidgetCard icon={BsMusicPlayerFill} title="음악 플레이어" dragHandleProps={dragHandleProps} widgetType="musicPlayer">
    <div className="flex flex-col gap-3">
      <Button onClick={addMusic} disabled={loading}>음악 파일 추가</Button>
      {(error || playError) && <p role="alert">{error || playError}</p>}
      <Typography size="sm">{track?.name || "재생할 음악을 선택하세요"}</Typography>
      <audio ref={audio} src={track?.url} controls loop={repeat} onEnded={next} onError={() => setPlayError("음악 파일을 재생할 수 없습니다.")} style={{ width: "100%" }} />
      <label><input type="checkbox" checked={repeat} onChange={event => setRepeat(event.target.checked)} /> 한 곡 반복</label>
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {musicList.map(item => <div key={item._id} className="flex gap-2 items-center">
          <button onClick={() => setSelected(item._id)} aria-label={`음악 재생 ${item.name}`} style={{ flex: 1, textAlign: "left", overflowWrap: "anywhere" }}>{item.name}</button>
          <Button size="sm" ariaLabel={`음악 삭제 ${item.name}`} onClick={async () => { if (selected === item._id) { audio.current?.pause(); setSelected(null); } await removeMusic(item._id); }}>삭제</Button>
        </div>)}
      </div>
    </div>
  </WidgetCard>;
}
