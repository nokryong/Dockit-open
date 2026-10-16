import {
  Button,
  Calendar,
  DatePicker,
  Divider,
  Input,
  Modal,
  Tag,
  toast,
  Typography
} from "sud-ui";
import WidgetCard from "./WidgetCard";
import { useState, useEffect } from "react";
import { CalendarOutline, Plus, TriangleLeft, TriangleRight } from "sud-icons";
import dayjs from "dayjs";
import { locale_ko } from "../../constant/locale";
import { createData, deleteData, fetchDataList } from "../../utils/dataUtils";

import { useSetting } from "../../context/SettingContext";
import {
  inputProps,
  newShadowDarkSm,
  newShadowLightSm,
  withOverlayShadow
} from "../../constant/uiProps";
import { useDarkMode } from "../../context/DarkModeContext";

export default function CalendarWidget({ dragHandleProps }) {
  const { setting } = useSetting();
  const { isDarkMode } = useDarkMode();
  const [events, setEvents] = useState([]);
  const [todayEvents, setTodayEvents] = useState([]);
  const [today, setToday] = useState(new Date());
  const [date, setDate] = useState(dayjs(today));
  const [holidays, setHolidays] = useState([]);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [openAddModal, setOpenAddModal] = useState(false);
  const [itemContent, setItemContent] = useState("");
  const [itemDate, setItemDate] = useState(dayjs(today));
  const [calendarError, setCalendarError] = useState(null);
  const [adding, setAdding] = useState(false);

  const [showYearMonthSelector, setShowYearMonthSelector] = useState(false);

  const handlePrev = () => {
    if (!date) return;

    const newDate = date.subtract(1, "month").startOf("month");
    setDate(newDate);
    setToday(newDate.toDate());

    // 연도가 바뀌면 휴일 업데이트
    const newYear = newDate.year();
    if (newYear !== currentYear) {
      setCurrentYear(newYear);
    }
  };

  const handleNext = () => {
    if (!date) return;

    const newDate = date.add(1, "month").startOf("month");
    setDate(newDate);
    setToday(newDate.toDate());

    // 연도가 바뀌면 휴일 업데이트
    const newYear = newDate.year();
    if (newYear !== currentYear) {
      setCurrentYear(newYear);
    }
  };

  const handleDateClick = () => {
    setShowYearMonthSelector(!showYearMonthSelector);
  };

  const yearText = locale_ko.yearFormat(date);
  const monthNumber = date.month() + 1;

  const fetchEvents = async () => {
    try {
      const res = await fetchDataList("calendar");
      setEvents(Array.isArray(res?.content) ? res.content : []);
      setCalendarError(null);
    } catch (error) {
      console.error("일정 목록 가져오기 실패:", error);
      setEvents([]);
      setTodayEvents([]);
      setCalendarError(
        "일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
    }
  };

  const handleAddItem = async () => {
    if (!itemContent.trim() || !dayjs(itemDate).isValid() || adding) return;

    setAdding(true);
    try {
      await createData("calendar", null, {
        content: itemContent.trim(),
        date: dayjs(itemDate).format("YYYY-MM-DD")
      });
      setOpenAddModal(false);
      setItemContent("");
      setItemDate(dayjs(today));
      setCalendarError(null);
    toast.success("일정이 추가되었습니다.");

      fetchEvents();
    } catch (error) {
      console.error("일정 추가 실패:", error);
      setCalendarError("일정을 저장하지 못했습니다. 입력값은 유지됩니다.");
      toast.danger("일정 저장에 실패했습니다.");
    } finally { setAdding(false); }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    if (events.length === 0) {
      setTodayEvents([]);
      return;
    }

    setTodayEvents(
      events.filter((event) => dayjs(event.date).isSame(dayjs(date), "day"))
    );
  }, [events, date]);

  const handleDeleteEvent = async (id) => {
    try {
      await deleteData("calendar", id);
      setCalendarError(null);
      fetchEvents();
    } catch (error) {
      console.error("일정 삭제 실패:", error);
      setCalendarError(
        "일정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."
      );
      toast.danger("일정 삭제에 실패했습니다.");
    }
  };

  return (
    <WidgetCard
      icon={CalendarOutline}
      title="달력"
      dragHandleProps={dragHandleProps}
      widgetType="calendar"
      titleBtn={
        <Button
          ariaLabel="일정 추가"
          icon={<Plus size={13} />}
          colorType="text"
          size="sm"
          onClick={() => setOpenAddModal(true)}
        />
      }
    >
      <div className="w-full flex flex-col gap-2">
        <Calendar
          value={date}
          locale="ko"
          items={events}
          onChange={(value) => setDate(dayjs(value))}
          size="miniView"
          headerRender={
            <div className="flex justify-center items-center w-full">
              <Button
                onClick={handlePrev}
                size="sm"
                colorType="text"
                icon={<TriangleLeft size={15} />}
              />

              <Typography
                as="span"
                gmarket="Medium"
                onClick={handleDateClick}
                style={{ cursor: "pointer" }}
              >
                {yearText}{" "}
                {monthNumber < 10 ? `0${monthNumber}월` : `${monthNumber}월`}
              </Typography>
              <Button
                onClick={handleNext}
                size="sm"
                colorType="text"
                icon={<TriangleRight size={15} />}
              />
            </div>
          }
          holidays={holidays}
          holidaysStyle={{
            background: "cool-gray-2",
            color: "red-7"
          }}
        />
        <Divider />
        {calendarError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
            <Typography color="red-7" size="sm">
              {calendarError}
            </Typography>
          </div>
        )}
        <div className="flex flex-col gap-2 items-center">
          <Typography gmarket="Medium" className="text-center">
            {date.format("YYYY/MM/DD")} 일정
          </Typography>
          <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[80px]">
            {todayEvents.map((event, index) => (
              <Tag
                key={event._id}
                colorType={index % 2 === 0 ? setting.theme : "blue"}
                closeable
                onClose={() => handleDeleteEvent(event._id)}
              >
                <Typography size="sm">● {event.content}</Typography>
              </Tag>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={openAddModal}
        onClose={() => setOpenAddModal(false)}
        style={withOverlayShadow()}
      >
        <div className="flex flex-col gap-2">
          <Typography pretendard="SB" size="lg">
            일정추가
          </Typography>
          <Input
            placeholder="내용"
            shadow="none"
            size="sm"
            style={{ width: "100%" }}
            value={itemContent}
            onChange={(e) => setItemContent(e.target.value)}
            {...inputProps}
            background={`${setting.theme}-1`}
          />
          <DatePicker
            placeholder="날짜"
            shadow="none"
            size="sm"
            style={{ width: "100%" }}
            locale="ko"
            value={itemDate}
            onChange={(value) => setItemDate(value)}
            {...inputProps}
            background={`${setting.theme}-1`}
          />
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => setOpenAddModal(false)}
              colorType="danger"
              size="sm"
              border={false}
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            >
              취소
            </Button>
            <Button
              onClick={handleAddItem}
              disabled={!itemContent.trim() || !dayjs(itemDate).isValid() || adding}
              colorType="primary"
              size="sm"
              border={false}
              {...(isDarkMode ? newShadowDarkSm : newShadowLightSm)}
            >
              추가
            </Button>
          </div>
        </div>
      </Modal>
    </WidgetCard>
  );
}
