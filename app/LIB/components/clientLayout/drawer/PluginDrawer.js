import { t as uiText, useI18n, translateMessage } from "../../../i18n";
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
import { localizePlugin } from '../../../utils/pluginLocalization';

export default function PluginDrawer({ openPluginDrawer, setOpenPluginDrawer }) {
  useI18n();
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
  const [updates, setUpdates] = useState({});
  const [updating, setUpdating] = useState(null);
  const installedVersions = plugins.map(plugin => `${plugin.id}@${plugin.version}`).join('|');
  useEffect(() => {
    if (!openPluginDrawer || loading) return;
    let active = true;
    const check = async () => {
      try {
        const result = await localBridge().plugins.checkUpdates();
        if (!active) return;
        setUpdates(Object.fromEntries(result.updates.map(update => [update.id, update.version])));
        if (result.errors.length) toast.danger(translateMessage(result.errors.join('\n')));
      } catch (failure) { if (active) toast.danger(translateMessage(failure.message)); }
    };
    check();
    return () => { active = false; };
  }, [openPluginDrawer, loading, installedVersions]);
  useEffect(() => {
    if (!openPluginDrawer) return;
    if (loadError && loadError !== reported.current.error) toast.danger(translateMessage(loadError));
    for (const warning of warnings) if (!reported.current.warnings.has(warning)) toast.warning(translateMessage(warning));
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
    } catch (failure) { toast.danger(translateMessage(failure.message)); setPreview(null); setSelectedFolder(null); }
    finally { setBusy(false); }
  };
  const uninstall = async keepData => {
    setBusy(true);
    try {
      await localBridge().plugins.uninstall(removing.id, keepData);
      await refresh();
      setRemoving(null);
    } catch (failure) { toast.danger(translateMessage(failure.message)); }
    finally { setBusy(false); }
  };
  const update = async plugin => {
    setBusy(true); setUpdating(plugin.id);
    try {
      await localBridge().plugins.update(plugin.id);
      setUpdates(previous => { const next = { ...previous }; delete next[plugin.id]; return next; });
      await refresh();
    } catch (failure) { toast.danger(translateMessage(failure.message)); }
    finally { setBusy(false); setUpdating(null); }
  };
  return (
    <Template
      open={openPluginDrawer}
      onClose={() => setOpenPluginDrawer(false)}
      title={uiText("플러그인")}
      content={
        <section
          className="flex min-w-0 flex-col gap-2"
          aria-label={uiText("플러그인 관리")}
          aria-busy={loading}
        >
          <div className="flex justify-end">
            <SmallButton
              disabled={busy || loading}
              onClick={() => setInstalling(true)}
            >
              {uiText("플러그인 설치")}
            </SmallButton>
          </div>
          {plugins.map((plugin) => (
            <Card
              key={plugin.id}
              width="100%"
              shadow="none"
              border={false}
              background={`${setting.theme}-1`}
              className="[&>.sud-card\_\_body]:px-3! [&>.sud-card\_\_body]:py-2!"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <Div
                  color={`${setting.theme}-8`}
                  className="flex size-10 shrink-0 items-center justify-center"
                >
                  <PluginIcon
                    icon={
                      plugin.iconAsset || plugin.icon || plugin.widgets[0]?.icon
                    }
                    size={40}
                  />
                </Div>
                <div className="flex min-w-0 flex-1 flex-col items-start gap-0">
                  {plugin.description ? (
                    <Button
                      size="sm"
                      color="black-10"
                      background="transparent"
                      border={false}
                      className="max-w-full gap-1! rounded-none! p-0! [&_.sud-button\_\_label]:min-w-0 [&_.sud-button\_\_label]:text-left"
                      ariaLabel={uiText("{0} 설명", plugin.name)}
                      ariaExpanded={Boolean(expanded[plugin.id])}
                      ariaControls={`plugin-description-${plugin.id}`}
                      icon={
                        <TbChevronDown
                          size={12}
                          className={`shrink-0 transition-transform ${expanded[plugin.id] ? "rotate-180" : ""}`}
                        />
                      }
                      iconPosition="right"
                      onClick={() =>
                        setExpanded((previous) => ({
                          ...previous,
                          [plugin.id]: !previous[plugin.id]
                        }))
                      }
                    >
                      <Typography
                        pretendard="SB"
                        size="sm"
                        className="block break-words leading-tight"
                      >
                        {plugin.name}
                      </Typography>
                    </Button>
                  ) : (
                    <Typography
                      pretendard="SB"
                      size="sm"
                      className="block break-words leading-tight"
                    >
                      {plugin.name}
                    </Typography>
                  )}
                  <Typography
                    size="xs"
                    className="block break-words leading-tight"
                  >
                    {plugin.publisher} · {plugin.version}
                  </Typography>
                  {plugin.description && expanded[plugin.id] && (
                    <Typography
                      id={`plugin-description-${plugin.id}`}
                      size="sm"
                      className="mt-1 block break-words leading-snug"
                    >
                      {plugin.description}
                    </Typography>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0">
                  {updates[plugin.id] && (
                    <SmallButton
                      disabled={busy}
                      ariaLabel={uiText("{0} 업데이트", plugin.name)}
                      onClick={() => update(plugin)}
                    >
                      {updating === plugin.id
                        ? uiText("업데이트 중…")
                        : uiText("업데이트")}
                    </SmallButton>
                  )}
                  <SmallButton
                    disabled={busy}
                    ariaLabel={uiText("{0} 삭제", plugin.name)}
                    onClick={() => setRemoving(plugin)}
                  >
                    {uiText("삭제")}
                  </SmallButton>
                </div>
              </div>
            </Card>
          ))}
          <Modal
            open={installing}
            onClose={() => {
              if (!busy) setInstalling(false);
            }}
            onEsc={!busy}
            title={uiText("플러그인 설치")}
            ariaLabel={uiText("플러그인 설치")}
            width="min(420px, calc(100vw - 32px))"
          >
            <form onSubmit={install} className="flex min-w-0 flex-col gap-2">
              <Input
                {...inputProps}
                size="sm"
                type="url"
                ariaLabel={uiText("GitHub 주소")}
                placeholder="https://github.com/nokryong/dockit-plugins"
                value={githubUrl}
                onChange={(event) => {
                  setGithubUrl(event.target.value);
                  setPreview(null);
                  setSelectedFolder(null);
                }}
                disabled={busy}
                background={`${setting.theme}-1`}
              />
              {preview?.plugins.length > 1 && (
                <Select
                  size="sm"
                  aria-label={uiText("설치할 플러그인")}
                  placeholder={uiText("플러그인 선택")}
                  value={selectedFolder ?? ""}
                  onChange={setSelectedFolder}
                  disabled={busy}
                  background={`${setting.theme}-1`}
                  options={preview.plugins.map((source) => {
                    const plugin = localizePlugin(source, setting.language);
                    return {
                      value: plugin.path,
                      label: `${plugin.name} · ${plugin.publisher} · ${plugin.version}`
                    };
                  })}
                />
              )}
              <div className="flex justify-end gap-2">
                <SmallButton
                  disabled={busy}
                  onClick={() => setInstalling(false)}
                >
                  {uiText("취소")}
                </SmallButton>
                <SmallButton
                  type="submit"
                  disabled={
                    busy ||
                    !githubUrl.trim() ||
                    (preview?.plugins.length > 1 && selectedFolder === null)
                  }
                >
                  {busy ? uiText("설치 중…") : uiText("설치")}
                </SmallButton>
              </div>
            </form>
          </Modal>
          <Modal
            open={Boolean(removing)}
            onClose={() => {
              if (!busy) setRemoving(null);
            }}
            onEsc={!busy}
            title={uiText("플러그인 삭제")}
            ariaLabel={uiText("플러그인 삭제")}
            width="min(420px, calc(100vw - 32px))"
          >
            <div className="flex flex-col gap-4">
              <Typography size="sm">
                {removing?.name}
                {uiText("의 데이터를 남겨둘까요?")}
              </Typography>
              <div className="flex flex-wrap justify-end gap-2">
                <SmallButton disabled={busy} onClick={() => setRemoving(null)}>
                  {uiText("취소")}
                </SmallButton>
                <SmallButton disabled={busy} onClick={() => uninstall(false)}>
                  {uiText("함께 삭제")}
                </SmallButton>
                <SmallButton disabled={busy} onClick={() => uninstall(true)}>
                  {uiText("데이터 남기기")}
                </SmallButton>
              </div>
            </div>
          </Modal>
        </section>
      }
    />
  );
}
