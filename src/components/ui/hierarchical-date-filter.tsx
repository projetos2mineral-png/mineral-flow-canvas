import * as React from "react";
import { ChevronDown, ChevronRight, Calendar } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface DateOption {
  value: string; // ISO date
  label: string; // DD/MM/YYYY
}

interface MonthOption {
  month: number;
  label: string;
  dates: DateOption[];
}

interface YearOption {
  year: number;
  months: MonthOption[];
}

interface HierarchicalDateFilterProps {
  dates: string[]; // List of available ISO dates
  selectedDates: Set<string>;
  onChange: (selected: Set<string>) => void;
}

export function HierarchicalDateFilter({
  dates,
  selectedDates,
  onChange,
}: HierarchicalDateFilterProps) {
  const [openYears, setOpenYears] = React.useState<Set<number>>(new Set());
  const [openMonths, setOpenMonths] = React.useState<Set<string>>(new Set());

  const hierarchy = React.useMemo(() => {
    const yearsMap = new Map<number, Map<number, string[]>>();
    
    dates.forEach((d) => {
      const date = new Date(d.length <= 10 ? `${d}T00:00:00Z` : d);
      const y = date.getUTCFullYear();
      const m = date.getUTCMonth();
      
      if (!yearsMap.has(y)) yearsMap.set(y, new Map());
      const yearMonths = yearsMap.get(y)!;
      if (!yearMonths.has(m)) yearMonths.set(m, []);
      yearMonths.get(m)!.push(d);
    });

    const result: YearOption[] = Array.from(yearsMap.entries())
      .map(([year, monthsMap]) => ({
        year,
        months: Array.from(monthsMap.entries())
          .map(([month, dateStrings]) => ({
            month,
            label: new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(2000, month, 1)),
            dates: dateStrings
              .sort()
              .map((d) => ({
                value: d,
                label: new Date(d.length <= 10 ? `${d}T00:00:00Z` : d).toLocaleDateString("pt-BR", { timeZone: "UTC" }),
              })),
          }))
          .sort((a, b) => a.month - b.month),
      }))
      .sort((a, b) => b.year - a.year);

    return result;
  }, [dates]);

  const toggleYear = (y: number) => {
    const next = new Set(openYears);
    if (next.has(y)) next.delete(y);
    else next.add(y);
    setOpenYears(next);
  };

  const toggleMonth = (y: number, m: number) => {
    const key = `${y}-${m}`;
    const next = new Set(openMonths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenMonths(next);
  };

  const handleYearCheck = (yearOpt: YearOption, checked: boolean) => {
    const next = new Set(selectedDates);
    yearOpt.months.forEach((m) => {
      m.dates.forEach((d) => {
        if (checked) next.add(d.value);
        else next.delete(d.value);
      });
    });
    onChange(next);
  };

  const handleMonthCheck = (monthOpt: MonthOption, checked: boolean) => {
    const next = new Set(selectedDates);
    monthOpt.dates.forEach((d) => {
      if (checked) next.add(d.value);
      else next.delete(d.value);
    });
    onChange(next);
  };

  const handleDateCheck = (dateVal: string, checked: boolean) => {
    const next = new Set(selectedDates);
    if (checked) next.add(dateVal);
    else next.delete(dateVal);
    onChange(next);
  };

  const getYearState = (yearOpt: YearOption) => {
    const allDates = yearOpt.months.flatMap((m) => m.dates.map((d) => d.value));
    const selectedCount = allDates.filter((d) => selectedDates.has(d)).length;
    if (selectedCount === 0) return false;
    if (selectedCount === allDates.length) return true;
    return "indeterminate";
  };

  const getMonthState = (monthOpt: MonthOption) => {
    const allDates = monthOpt.dates.map((d) => d.value);
    const selectedCount = allDates.filter((d) => selectedDates.has(d)).length;
    if (selectedCount === 0) return false;
    if (selectedCount === allDates.length) return true;
    return "indeterminate";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 justify-start font-normal px-3 min-w-[160px]">
          <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
          {selectedDates.size === 0 
            ? "Data desejada" 
            : `${selectedDates.size} selecionada(s)`}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-3 border-b border-border bg-muted/30 flex justify-between items-center">
          <span className="text-xs font-medium">Filtrar por data</span>
          {selectedDates.size > 0 && (
            <button 
              onClick={() => onChange(new Set())}
              className="text-[10px] text-primary hover:underline"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="max-h-[350px] overflow-y-auto p-2">
          {hierarchy.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center">Nenhuma data disponível</div>
          ) : (
            hierarchy.map((yearOpt) => (
              <div key={yearOpt.year} className="mb-1">
                <div className="flex items-center gap-1 py-1 hover:bg-accent/50 rounded px-1">
                  <button onClick={() => toggleYear(yearOpt.year)} className="p-0.5">
                    {openYears.has(yearOpt.year) ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                  <Checkbox 
                    id={`y-${yearOpt.year}`}
                    checked={getYearState(yearOpt)}
                    onCheckedChange={(c) => handleYearCheck(yearOpt, !!c)}
                  />
                  <label htmlFor={`y-${yearOpt.year}`} className="text-xs font-semibold cursor-pointer select-none">
                    {yearOpt.year}
                  </label>
                </div>

                {openYears.has(yearOpt.year) && (
                  <div className="ml-4 border-l border-border pl-2 mt-0.5">
                    {yearOpt.months.map((monthOpt) => (
                      <div key={monthOpt.month} className="mb-0.5">
                        <div className="flex items-center gap-1 py-1 hover:bg-accent/50 rounded px-1">
                          <button onClick={() => toggleMonth(yearOpt.year, monthOpt.month)} className="p-0.5">
                            {openMonths.has(`${yearOpt.year}-${monthOpt.month}`) ? (
                              <ChevronDown className="h-3 w-3 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3 w-3 text-muted-foreground" />
                            )}
                          </button>
                          <Checkbox 
                            id={`m-${yearOpt.year}-${monthOpt.month}`}
                            checked={getMonthState(monthOpt)}
                            onCheckedChange={(c) => handleMonthCheck(monthOpt, !!c)}
                          />
                          <label 
                            htmlFor={`m-${yearOpt.year}-${monthOpt.month}`} 
                            className="text-xs capitalize cursor-pointer select-none"
                          >
                            {monthOpt.label}
                          </label>
                        </div>

                        {openMonths.has(`${yearOpt.year}-${monthOpt.month}`) && (
                          <div className="ml-4 border-l border-border pl-2 mt-0.5">
                            {monthOpt.dates.map((d) => (
                              <div key={d.value} className="flex items-center gap-2 py-0.5 hover:bg-accent/50 rounded px-1">
                                <Checkbox 
                                  id={`d-${d.value}`}
                                  checked={selectedDates.has(d.value)}
                                  onCheckedChange={(c) => handleDateCheck(d.value, !!c)}
                                />
                                <label htmlFor={`d-${d.value}`} className="text-[11px] cursor-pointer select-none">
                                  {d.label}
                                </label>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
