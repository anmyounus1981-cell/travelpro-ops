"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

type Airport = {
  iata: string;
  name: string;
  city: string;
  country: string;
};

type SearchableAirport = Airport & {
  searchText: string;
  citySearch: string;
  nameSearch: string;
};

type AirportDataset = {
  airports: SearchableAirport[];
  byCode: Map<string, SearchableAirport>;
};

type AirportAutocompleteProps = {
  id: string;
  label: string;
  value: string;
  onChange: (iata: string) => void;
  disabled?: boolean;
  required?: boolean;
};

let datasetPromise: Promise<AirportDataset> | null = null;

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function airportLabel(airport: Airport): string {
  const location = airport.city || airport.name;
  return `${location}, ${airport.country} - ${airport.name} (${airport.iata})`;
}

function loadAirportDataset(): Promise<AirportDataset> {
  if (datasetPromise) return datasetPromise;

  datasetPromise = (async () => {
    const response = await fetch("/data/airports.json", {
      signal: AbortSignal.timeout(20_000),
      credentials: "same-origin",
    });

    if (!response.ok) {
      throw new Error("Airport data could not be loaded.");
    }

    const text = await response.text();

    if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024) {
      throw new Error("Airport data exceeds the size limit.");
    }

    const data: unknown = JSON.parse(text);

    if (
      data === null ||
      typeof data !== "object" ||
      !("schemaVersion" in data) ||
      data.schemaVersion !== 1 ||
      !("sourceCommit" in data) ||
      typeof data.sourceCommit !== "string" ||
      !/^[0-9a-f]{40}$/.test(data.sourceCommit) ||
      !("airports" in data) ||
      !Array.isArray(data.airports) ||
      data.airports.length < 1000 ||
      data.airports.length > 20000
    ) {
      throw new Error("Airport data has an invalid format.");
    }

    const airports: SearchableAirport[] = [];
    const byCode = new Map<string, SearchableAirport>();

    for (const record of data.airports) {
      if (
        record === null ||
        typeof record !== "object" ||
        typeof record.iata !== "string" ||
        !/^[A-Z]{3}$/.test(record.iata) ||
        typeof record.name !== "string" ||
        !record.name.trim() ||
        record.name.length > 500 ||
        typeof record.city !== "string" ||
        record.city.length > 300 ||
        typeof record.country !== "string" ||
        !record.country.trim() ||
        record.country.length > 200 ||
        byCode.has(record.iata)
      ) {
        throw new Error("Airport data contains an invalid record.");
      }

      const airport: SearchableAirport = {
        iata: record.iata,
        name: record.name,
        city: record.city,
        country: record.country,
        citySearch: normalizeSearch(record.city),
        nameSearch: normalizeSearch(record.name),
        searchText: normalizeSearch(
          `${record.iata} ${record.city} ${record.name} ${record.country}`,
        ),
      };

      airports.push(airport);
      byCode.set(airport.iata, airport);
    }

    return { airports, byCode };
  })().catch((error) => {
    datasetPromise = null;
    throw error;
  });

  return datasetPromise;
}

export default function AirportAutocomplete({
  id,
  label,
  value,
  onChange,
  disabled = false,
  required = false,
}: AirportAutocompleteProps) {
  const uniqueId = useId();
  const listId = `${uniqueId}-airports`;
  const helpId = `${uniqueId}-help`;
  const inputRef = useRef<HTMLInputElement>(null);

  const [dataset, setDataset] = useState<AirportDataset | null>(null);
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const selectedAirport = dataset?.byCode.get(value);
  const inputText = value
    ? selectedAirport
      ? airportLabel(selectedAirport)
      : value
    : query;

  useEffect(() => {
    if (loadAttempt === 0) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadError(false);

    loadAirportDataset()
      .then((loaded) => {
        if (!cancelled) setDataset(loaded);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  }, [disabled]);

  useEffect(() => {
    const invalidSelection = query.trim() !== "" && value === "";
    inputRef.current?.setCustomValidity(
      invalidSelection ? "Select an airport from the search results." : "",
    );
  }, [query, value]);

  const search = normalizeSearch(query);

  const results = useMemo(() => {
    if (!dataset || value || search.length < 2) return [];

    const tokens = search.split(" ");
    const matches: { airport: SearchableAirport; rank: number }[] = [];

    for (const airport of dataset.airports) {
      if (!tokens.every((token) => airport.searchText.includes(token))) {
        continue;
      }

      const code = airport.iata.toLowerCase();
      const rank =
        code === search
          ? 0
          : code.startsWith(search)
            ? 1
            : airport.citySearch === search
              ? 2
              : airport.citySearch.startsWith(search)
                ? 3
                : airport.nameSearch.startsWith(search)
                  ? 4
                  : 5;

      matches.push({ airport, rank });
    }

    matches.sort(
      (left, right) =>
        left.rank - right.rank ||
        left.airport.iata.localeCompare(right.airport.iata),
    );

    return matches.slice(0, 12).map((match) => match.airport);
  }, [dataset, search, value]);

  function openSearch() {
    if (disabled) return;

    setIsOpen(true);
    if (loadAttempt === 0) setLoadAttempt(1);
  }

  function selectAirport(airport: Airport) {
    setQuery("");
    onChange(airport.iata);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.setCustomValidity("");
    inputRef.current?.focus();
  }

    function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openSearch();

      if (results.length === 0) return;

      setActiveIndex((current) =>
        event.key === "ArrowDown"
          ? (current + 1) % results.length
          : current <= 0
            ? results.length - 1
            : current - 1,
      );
      return;
    }

    if (
  event.key === "Enter" &&
  isOpen &&
  !value &&
  query.trim() !== ""
) {
      event.preventDefault();

      if (activeIndex >= 0 && results[activeIndex]) {
        selectAirport(results[activeIndex]);
      }
    }
  }

    useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document
        .getElementById(`${listId}-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, isOpen, listId]);

  return (
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsOpen(false);
          setActiveIndex(-1);
        }
      }}
    >
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-bold text-slate-700"
      >
        {label}
      </label>

      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && !disabled}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={
          isOpen && activeIndex >= 0 && results[activeIndex]
            ? `${listId}-${activeIndex}`
            : undefined
        }
        aria-describedby={helpId}
        autoComplete="off"
        spellCheck={false}
        maxLength={1000}
        required={required}
        disabled={disabled}
        value={inputText}
        placeholder="Search city, airport or IATA code"
        onFocus={openSearch}
        onKeyDown={handleKeyDown}
        onChange={(event) => {
          setQuery(event.target.value);
          onChange("");
          setActiveIndex(-1);
          openSearch();
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      />

      <p id={helpId} className="mt-2 text-xs text-slate-500">
        {value
          ? `Selected airport code: ${value}`
          : "Optional. Type at least 2 characters, then select an airport."}
      </p>

      {isOpen && !disabled && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {isLoading && (
            <p role="status" className="px-4 py-3 text-sm text-slate-600">
              Loading airports...
            </p>
          )}

          {loadError && (
            <div className="px-4 py-3">
              <p role="alert" className="text-sm text-red-700">
                Airport search is unavailable. Retry to load airport data.
              </p>
              <button
                type="button"
                onClick={() => setLoadAttempt((attempt) => attempt + 1)}
                disabled={isLoading}
                className="mt-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Retry airport search
              </button>
            </div>
          )}

          {!isLoading && !loadError && dataset && (
            <p role="status" className="px-4 py-2 text-xs text-slate-500">
              {value
                ? "Edit the field to search for a different airport."
                : search.length < 2
                  ? "Enter at least 2 characters."
                  : results.length === 0
                    ? "No matching airports. Try another city, name or code."
                    : `Showing ${results.length} results. Refine your search if needed.`}
            </p>
          )}

          <div
            id={listId}
            role="listbox"
            aria-label={`${label} airports`}
            aria-busy={isLoading}
            className="max-h-72 overflow-y-auto overscroll-contain"
          >
            {results.map((airport, index) => (
              <button
                key={airport.iata}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectAirport(airport)}
                className={`block w-full border-0 px-4 py-3 text-left text-sm leading-relaxed focus:outline-none ${
                  activeIndex === index
                    ? "bg-blue-100 text-blue-950"
                    : "bg-white text-slate-800 hover:bg-slate-100"
                }`}
              >
                {airportLabel(airport)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}