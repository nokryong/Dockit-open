import { useRef, useState } from 'react';
import { Avatar, Button, Card, Div, Input, Modal, Typography, toast } from 'sud-ui';
import { TbCheck, TbCopy, TbDownload, TbExternalLink, TbHeartFilled } from 'react-icons/tb';
import SmallButton from '../common/SmallButton';
import { inputProps, withOverlayShadow } from '../../constant/uiProps';
import { localBridge } from '../../utils/localBridge';

export function PluginCredentialDialog({ prompt, sessionId, theme, onClose }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async key => {
    setBusy(true);
    try {
      const status = await localBridge().plugins.request(sessionId, 'credentials.set', { service: prompt.id, value: key });
      setValue(''); onClose(status);
    } catch (error) { toast.danger(error.message); }
    finally { setBusy(false); }
  };
  return <Modal open title={`${prompt.label} API Key`} ariaLabel={`${prompt.label} API Key`} width="min(420px, calc(100vw - 32px))" onClose={() => { if (!busy) onClose(prompt); }} onEsc={!busy}>
    <form className="flex min-w-0 flex-col gap-2" onSubmit={event => { event.preventDefault(); save(value); }}>
      <Typography size="xs">{new URL(prompt.url).origin}</Typography>
      <Input {...inputProps} type="password" autoComplete="off" ariaLabel="API Key" placeholder={prompt.configured ? '변경할 API Key' : 'API Key'} value={value} onChange={event => setValue(event.target.value)} disabled={busy} background={`${theme}-1`} />
      <div className="flex justify-end gap-2">
        {prompt.configured && <SmallButton disabled={busy} onClick={() => save('')}>키 삭제</SmallButton>}
        <SmallButton disabled={busy} onClick={() => onClose(prompt)}>취소</SmallButton>
        <SmallButton type="submit" disabled={busy || !value.trim()}>저장</SmallButton>
      </div>
    </form>
  </Modal>;
}

export function PluginImageDialog({ image, sessionId, theme, isDarkMode, onClose }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const imageRef = useRef(null);
  const copy = async () => {
    setBusy(true);
    try {
      const source = imageRef.current;
      if (!source?.complete || !source.naturalWidth) throw new Error('이미지를 불러온 후 다시 복사해주세요.');
      const canvas = document.createElement('canvas');
      canvas.width = source.naturalWidth;
      canvas.height = source.naturalHeight;
      canvas.getContext('2d').drawImage(source, 0, 0);
      await localBridge().plugins.request(sessionId, 'images.copy', { dataUrl: canvas.toDataURL('image/png') });
      setCopied(true);
    } catch (error) { toast.danger(error.message); }
    finally { setBusy(false); }
  };
  const invoke = async (method, payload) => {
    setBusy(true);
    try { await localBridge().plugins.request(sessionId, method, payload); }
    catch (error) { toast.danger(error.message); }
    finally { setBusy(false); }
  };
  return <Modal open ariaLabel="이미지 미리보기" onClose={onClose} width="min(760px, calc(100vw - 32px))" border={false} style={withOverlayShadow({ maxHeight: '90vh', overflowY: 'auto' }, isDarkMode)} thumb={<img ref={imageRef} src={image.displaySrc} alt={image.alt} className="max-h-[60vh] w-full object-contain" />}>
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-end justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar src={image.avatarSrc || image.author} alt={image.author} size="xs" />
          <div className="flex min-w-0 flex-col gap-1">
            <Typography pretendard="SB">{image.author}</Typography>
            {image.authorUrl && <SmallButton disabled={busy} onClick={() => invoke('external.open', { url: image.authorUrl })}><span className="flex items-center gap-1"><TbExternalLink size={12} />프로필</span></SmallButton>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {image.sourceUrl && <Button size="sm" ariaLabel="원본 페이지" border={false} background="transparent" color={`${theme}-8`} icon={<TbExternalLink size={18} />} disabled={busy} onClick={() => invoke('external.open', { url: image.sourceUrl })} />}
            <Button size="sm" ariaLabel="이미지 다운로드" border={false} background="transparent" color={`${theme}-8`} icon={<TbDownload size={18} />} disabled={busy} onClick={() => invoke('images.download', { url: image.url, filename: image.filename })} />
            <Button size="sm" ariaLabel="이미지 복사" border={false} background="transparent" color={`${theme}-8`} icon={copied ? <TbCheck size={18} /> : <TbCopy size={18} />} disabled={busy} onClick={copy} />
          </div>
          {image.likes !== undefined && <div className="flex items-center gap-1"><Div color="volcano"><TbHeartFilled size={18} /></Div><Typography size="sm">{image.likes}</Typography></div>}
        </div>
      </div>
      {image.caption && <Card width="100%" shadow="none" border={false} background={`${theme}-1`}><Typography>{image.caption}</Typography></Card>}
    </div>
  </Modal>;
}
