"use client";
import { t as uiText, useI18n } from "../../i18n";

import { Button, Typography, Upload } from "sud-ui";
import { PiFilePlus, PiUploadSimple } from "react-icons/pi";

export default function WorkspaceStarter({
  isFirstWorkspace = false,
  theme,
  uploadExtensions,
  onCreateDocument,
  onUploadFile
}) {
  useI18n();
  return (
    <section
      aria-labelledby="workspace-starter-title"
      className="flex w-full flex-col gap-6 rounded-2xl border border-zinc-200/80 bg-white/70 p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950/30"
    >
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 id="workspace-starter-title" className="text-balance">
          <Typography pretendard="SB" size="xl" color="white-1">
            {isFirstWorkspace
              ? uiText("첫 문서를 시작해 보세요")
              : uiText("이 폴더에서 새 작업을 시작해 보세요")}
          </Typography>
        </h2>
        <Typography className="text-pretty" size="sm" color="cool-gray-7">
          {uiText("새 문서를 만들거나 파일을 가져오세요.")}</Typography>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          icon={<PiFilePlus size={16} />}
          size="sm"
          border={false}
          background={`${theme}-7`}
          color={`${theme}-1`}
          className="min-h-10"
          onClick={onCreateDocument}
        >
          {uiText("새 문서")}</Button>
        <Upload listType="none" onChange={onUploadFile} ext={uploadExtensions}>
          <Button
            icon={<PiUploadSimple size={16} />}
            size="sm"
            border={false}
            colorType="text"
            color={`${theme}-7`}
            className="min-h-10"
          >
            {uiText("파일 가져오기")}</Button>
        </Upload>
      </div>

    </section>
  );
}
