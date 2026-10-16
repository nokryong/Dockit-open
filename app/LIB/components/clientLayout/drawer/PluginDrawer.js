import { useEffect, useRef, useState } from "react";
import { Button, Card, Div, Input, Modal, Select, Typography, toast } from "sud-ui";
import { TbChevronDown } from "react-icons/tb";
import Template from "./DrawerTemplate";
import SmallButton from "../../common/SmallButton";
import PluginIcon from "../../plugins/PluginIcon";
import { usePlugins } from "../../../context/PluginContext";
import { useSetting } from "../../../context/SettingContext";
import { localBridge } from "../../../utils/localBridge";
import { inputProps } from "../../../constant/uiProps";

export default function PluginDrawer({ openPluginDrawer, setOpenPluginDrawer }) {
  const { plugins, warnings, loading, error: loadError, refresh } = usePlugins();
  const { setting } = useSetting();
  const [busy, setBusy] = useState(false);
  const reported = useRef({ error: "", warnings: new Set() });
  const [removing, setRemoving] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [installing, setInstalling] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  useEffect(() => {
    if (!openPluginDrawer) return;
    if (loadError && loadError !== reported.current.error) toast.danger(loadError);
    for (const warning of warnings) if (!reported.current.warnings.has(warning)) toast.warning(warning);
    reported.current = { error: loadError, warnings: new Set(warnings) };
  }, [openPluginDrawer, loadError, warnings]);
  const install = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      const bridge = localBridge().plugins;
      const result = preview || await bridge.inspect(githubUrl.trim());
      setPreview(result);
      const folder = selectedFolder ?? (result.plugins.length === 1 ? result.plugins[0].path : null);
      if (folder === null) return;
      const plugin = await bridge.install(result.token, folder);
      if (plugin) { await refresh(); setInstalling(false); setGithubUrl(""); setPreview(null); setSelectedFolder(null); }
    } catch (failure) { toast.danger(failure.message); setPreview(null); setSelectedFolder(null); }
    finally { setBusy(false); }
  };
  const uninstall = async keepData => {
    setBusy(true);
    try {
      await localBridge().plugins.uninstall(removing.id, keepData);
      await refresh();
      setRemoving(null);
    } catch (failure) { toast.danger(failure.message); }
    finally { setBusy(false); }
  };
  return <Template open={openPluginDrawer} onClose={() => setOpenPluginDrawer(false)} title="플러그인" content={<section className="flex min-w-0 flex-col gap-2" aria-label="플러그인 관리" aria-busy={loading}>
    <div className="flex justify-end">
      <SmallButton disabled={busy || loading} onClick={() => setInstalling(true)}>플러그인 설치</SmallButton>
    </div>
    {plugins.map(plugin => <Card key={plugin.id} width="100%" shadow="none" border={false} background={`${setting.theme}-1`} className="[&>.sud-card\_\_body]:px-3! [&>.sud-card\_\_body]:py-2!">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <Div color={`${setting.theme}-8`} className="flex size-10 shrink-0 items-center justify-center">
          <PluginIcon icon={plugin.iconAsset || plugin.icon || plugin.widgets[0]?.icon} size={40} />
        </Div>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0">
          {plugin.description ? <Button
            size="sm" color="black-10" background="transparent" border={false}
            className="max-w-full gap-1! rounded-none! p-0! [&_.sud-button\_\_label]:min-w-0 [&_.sud-button\_\_label]:text-left"
            ariaLabel={`${plugin.name} 설명`} ariaExpanded={Boolean(expanded[plugin.id])} ariaControls={`plugin-description-${plugin.id}`}
            icon={<TbChevronDown size={12} className={`shrink-0 transition-transform ${expanded[plugin.id] ? 'rotate-180' : ''}`} />} iconPosition="right"
            onClick={() => setExpanded(previous => ({ ...previous, [plugin.id]: !previous[plugin.id] }))}
          ><Typography pretendard="SB" size="sm" className="block break-words leading-tight">{plugin.name}</Typography></Button>
            : <Typography pretendard="SB" size="sm" className="block break-words leading-tight">{plugin.name}</Typography>}
          <Typography size="xs" className="block break-words leading-tight">{plugin.publisher} · {plugin.version}</Typography>
          {plugin.description && expanded[plugin.id] && <Typography id={`plugin-description-${plugin.id}`} size="sm" className="mt-1 block break-words leading-snug">{plugin.description}</Typography>}
        </div>
        <SmallButton disabled={busy} ariaLabel={`${plugin.name} 삭제`} onClick={() => setRemoving(plugin)}>삭제</SmallButton>
      </div>
    </Card>)}
    <Modal open={installing} onClose={() => { if (!busy) setInstalling(false); }} onEsc={!busy} title="플러그인 설치" ariaLabel="플러그인 설치" width="min(420px, calc(100vw - 32px))">
      <form onSubmit={install} className="flex min-w-0 flex-col gap-2">
        <Input {...inputProps} size="sm" type="url" ariaLabel="GitHub 주소" placeholder="https://github.com/nokryong/dockit-plugins" value={githubUrl} onChange={event => { setGithubUrl(event.target.value); setPreview(null); setSelectedFolder(null); }} disabled={busy} background={`${setting.theme}-1`} />
        {preview?.plugins.length > 1 && <Select size="sm" aria-label="설치할 플러그인" placeholder="플러그인 선택" value={selectedFolder ?? ''} onChange={setSelectedFolder} disabled={busy} background={`${setting.theme}-1`} options={preview.plugins.map(plugin => ({ value: plugin.path, label: `${plugin.name} · ${plugin.publisher} · ${plugin.version}` }))} />}
        <div className="flex justify-end gap-2">
          <SmallButton disabled={busy} onClick={() => setInstalling(false)}>취소</SmallButton>
          <SmallButton type="submit" disabled={busy || !githubUrl.trim() || (preview?.plugins.length > 1 && selectedFolder === null)}>{busy ? '설치 중…' : '설치'}</SmallButton>
        </div>
      </form>
    </Modal>
    <Modal open={Boolean(removing)} onClose={() => { if (!busy) setRemoving(null); }} onEsc={!busy} title="플러그인 삭제" ariaLabel="플러그인 삭제" width="min(420px, calc(100vw - 32px))">
      <div className="flex flex-col gap-4">
        <Typography size="sm">{removing?.name}의 데이터를 남겨둘까요?</Typography>
        <div className="flex flex-wrap justify-end gap-2">
          <SmallButton disabled={busy} onClick={() => setRemoving(null)}>취소</SmallButton>
          <SmallButton disabled={busy} onClick={() => uninstall(false)}>함께 삭제</SmallButton>
          <SmallButton disabled={busy} onClick={() => uninstall(true)}>데이터 남기기</SmallButton>
        </div>
      </div>
    </Modal>
  </section>} />;
}
