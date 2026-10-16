import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import { Button, Div, Input, Typography } from "sud-ui";
import { panelInputProps } from "../../../constant/uiProps";
import { useSetting } from "../../../context/SettingContext";
import {
  getSemanticEditorErrorMessage,
  getSemanticEditorTargetSignature,
  resolveSemanticEditorTarget,
  validateSemanticEditorDraft
} from "../../../utils/semanticEditorUtils";

const readCurrentValues = (editor, target) => {
  const resolved = resolveSemanticEditorTarget(editor?.state?.doc, target);
  if (!resolved) return null;
  return {
    semanticKey: resolved.node.attrs?.semanticKey || "",
    semanticRole: resolved.node.attrs?.semanticRole || ""
  };
};

export default function SemanticAttributesEditor({
  editor,
  target,
  compact = false,
  onRequestClose
}) {
  const { setting } = useSetting();
  const theme = setting?.theme || "mint";
  const targetSignature = getSemanticEditorTargetSignature(target);
  const [semanticKey, setSemanticKey] = useState("");
  const [semanticRole, setSemanticRole] = useState("");
  const [, setRevision] = useState(0);
  const [statusMessage, setStatusMessage] = useState(null);
  const [commandError, setCommandError] = useState(null);
  const isDirtyRef = useRef(false);
  const isComposingRef = useRef(false);

  const syncFromDocument = useCallback(
    ({ force = false } = {}) => {
      if (!force && isDirtyRef.current) return;
      const values = readCurrentValues(editor, target);
      if (!values) return;
      setSemanticKey(values.semanticKey);
      setSemanticRole(values.semanticRole);
      isDirtyRef.current = false;
    },
    [editor, target]
  );

  useEffect(() => {
    setStatusMessage(null);
    setCommandError(null);
    syncFromDocument({ force: true });
  }, [syncFromDocument, targetSignature]);

  useEffect(() => {
    if (!editor?.on || !editor?.off) return undefined;
    const handleTransaction = () => {
      setRevision((current) => current + 1);
      if (!isDirtyRef.current) {
        setStatusMessage(null);
        setCommandError(null);
        syncFromDocument();
      }
    };
    editor.on("transaction", handleTransaction);
    return () => editor.off("transaction", handleTransaction);
  }, [editor, syncFromDocument]);

  const currentValues = readCurrentValues(editor, target);
  const validation = validateSemanticEditorDraft(editor?.state?.doc, target, {
    semanticKey,
    semanticRole
  });
  const validationError = validation.valid
    ? null
    : getSemanticEditorErrorMessage(validation.code);
  const visibleError = commandError || validationError;
  const keyInvalid = Boolean(
    commandError ||
      validation.code === "target_missing" ||
      validation.code?.startsWith("semanticKey_")
  );
  const roleInvalid = Boolean(
    commandError ||
      validation.code === "target_missing" ||
      validation.code?.startsWith("semanticRole_")
  );
  const hasChanges = Boolean(
    validation.valid &&
      currentValues &&
      (validation.value.semanticKey !== (currentValues.semanticKey || null) ||
        validation.value.semanticRole !== (currentValues.semanticRole || null))
  );

  const markDraftChanged = () => {
    isDirtyRef.current = true;
    setStatusMessage(null);
    setCommandError(null);
  };

  const applyValues = useCallback(
    (values, successMessage) => {
      const liveValidation = validateSemanticEditorDraft(
        editor?.state?.doc,
        target,
        values
      );
      if (!liveValidation.valid) {
        setCommandError(getSemanticEditorErrorMessage(liveValidation.code));
        setStatusMessage(null);
        return false;
      }

      const applied = editor?.commands?.setSemanticAttributes?.(
        liveValidation.resolved.position,
        liveValidation.value
      );
      if (!applied) {
        setCommandError(
          "문서가 변경되어 의미 정보를 저장하지 못했습니다. 다시 확인해 주세요."
        );
        setStatusMessage(null);
        return false;
      }

      isDirtyRef.current = false;
      setCommandError(null);
      setStatusMessage(successMessage);
      syncFromDocument({ force: true });
      return true;
    },
    [editor, syncFromDocument, target]
  );

  const handleApply = useCallback(() => {
    if (isComposingRef.current) return false;
    if (!validation.valid) {
      setCommandError(getSemanticEditorErrorMessage(validation.code));
      return false;
    }
    if (!hasChanges) {
      setCommandError(null);
      setStatusMessage("변경된 내용이 없습니다.");
      return false;
    }
    return applyValues(
      { semanticKey, semanticRole },
      "문서 구조 정보를 저장했습니다."
    );
  }, [applyValues, hasChanges, semanticKey, semanticRole, validation]);

  const handleClear = useCallback(() => {
    if (isComposingRef.current) return;
    if (!currentValues?.semanticKey && !currentValues?.semanticRole) {
      isDirtyRef.current = false;
      setSemanticKey("");
      setSemanticRole("");
      setCommandError(null);
      setStatusMessage("지울 문서 구조 정보가 없습니다.");
      return;
    }
    applyValues(
      { semanticKey: null, semanticRole: null },
      "문서 구조 정보를 지웠습니다."
    );
  }, [applyValues, currentValues]);

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      isDirtyRef.current = false;
      syncFromDocument({ force: true });
      setCommandError(null);
      setStatusMessage(null);
      onRequestClose?.();
      return;
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent?.isComposing &&
      !isComposingRef.current
    ) {
      event.preventDefault();
      handleApply();
    }
  };

  const sharedInputProps = {
    ...panelInputProps(theme),
    onCompositionStart: () => {
      isComposingRef.current = true;
    },
    onCompositionEnd: () => {
      isComposingRef.current = false;
    },
    onKeyDown: handleKeyDown
  };

  return (
    <Div
      className={`w-full flex flex-col ${compact ? "gap-2" : "gap-3"} rounded-xl`}
      background={`${theme}-1`}
      style={{ padding: compact ? "10px" : "12px" }}
      data-testid="semantic-attributes-editor"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Typography size="sm" pretendard="SB" color={`${theme}-10`}>
            문서 구조
          </Typography>
          <Typography size="xs" color="cool-gray-8">
            {target?.label || "선택한 요소"}를 사람이 찾기 쉬운 이름과 역할로 구분합니다.
          </Typography>
        </div>
        <Typography size="xs" color="cool-gray-7">
          {target?.label || "요소"}
        </Typography>
      </div>

      <label
        className="flex w-full flex-col gap-1"
        htmlFor={`semantic-key-${targetSignature}`}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      >
        <Typography size="xs" pretendard="M" color="cool-gray-9">
          고유 이름
        </Typography>
        <Input
          {...sharedInputProps}
          id={`semantic-key-${targetSignature}`}
          ariaLabel="고유 이름"
          ariaDescribedby={`semantic-help-${targetSignature} semantic-status-${targetSignature}`}
          ariaInvalid={keyInvalid}
          value={semanticKey}
          onChange={(event) => {
            markDraftChanged();
            setSemanticKey(event.target.value);
          }}
          placeholder="예: executive-summary"
        />
      </label>
      <Typography
        id={`semantic-help-${targetSignature}`}
        size="xs"
        color="cool-gray-7"
      >
        문서 안에서 한 번만 사용합니다. 문자·숫자로 시작하고 점·밑줄·하이픈을 쓸 수 있습니다.
      </Typography>

      <label
        className="flex w-full flex-col gap-1"
        htmlFor={`semantic-role-${targetSignature}`}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
      >
        <Typography size="xs" pretendard="M" color="cool-gray-9">
          역할
        </Typography>
        <Input
          {...sharedInputProps}
          id={`semantic-role-${targetSignature}`}
          ariaLabel="역할"
          ariaDescribedby={`semantic-role-help-${targetSignature} semantic-status-${targetSignature}`}
          ariaInvalid={roleInvalid}
          value={semanticRole}
          onChange={(event) => {
            markDraftChanged();
            setSemanticRole(event.target.value);
          }}
          placeholder="예: summary"
        />
      </label>
      <Typography
        id={`semantic-role-help-${targetSignature}`}
        size="xs"
        color="cool-gray-7"
      >
        같은 역할은 여러 요소에 함께 사용할 수 있습니다.
      </Typography>

      <div
        id={`semantic-status-${targetSignature}`}
        role={visibleError ? "alert" : "status"}
        aria-live={visibleError ? "assertive" : "polite"}
        className="min-h-5"
      >
        {(visibleError || statusMessage) && (
          <Typography
            size="xs"
            pretendard="M"
            color={visibleError ? "red-8" : `${theme}-9`}
          >
            {visibleError || statusMessage}
          </Typography>
        )}
      </div>

      <div className="flex w-full flex-wrap justify-end gap-2">
        <Button
          size="sm"
          colorType="text"
          border={false}
          background="transparent"
          color="cool-gray-8"
          onClick={handleClear}
        >
          <Typography size="xs">이름·역할 지우기</Typography>
        </Button>
        <Button
          size="sm"
          border={false}
          background={`${theme}-7`}
          color={`${theme}-1`}
          disabled={!validation.valid || !hasChanges}
          onClick={handleApply}
        >
          <Typography size="xs">적용</Typography>
        </Button>
      </div>
    </Div>
  );
}
