import { ChangeEvent, ComponentType, ReactElement, useCallback, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { useQuery } from 'urql';
import { useDebouncedCallback } from 'use-debounce';
import { Button, Checkbox, Drawer, Input, Spinner } from '@/components/v2';
import { FragmentType, graphql, useFragment } from '@/gql';
import { DateRangeInput } from '@/graphql';
import { useFormattedNumber, useRouteSelector, useToggle } from '@/lib/hooks';
import { ChevronUpIcon } from '@radix-ui/react-icons';

const OperationsFilter_OperationStatsConnectionFragment = graphql(`
  fragment OperationsFilter_OperationStatsConnectionFragment on OperationStatsConnection {
    nodes {
      id
      operationHash
      name
      ...OperationRow_OperationStatsFragment
    }
  }
`);

function OperationsFilter({
  onClose,
  isOpen,
  onFilter,
  operationStatsConnection,
  selected,
}: {
  onClose(): void;
  onFilter(keys: string[]): void;
  isOpen: boolean;
  operationStatsConnection: FragmentType<typeof OperationsFilter_OperationStatsConnectionFragment>;
  selected?: string[];
}): ReactElement {
  const operations = useFragment(
    OperationsFilter_OperationStatsConnectionFragment,
    operationStatsConnection,
  );

  function getOperationHashes() {
    const items: string[] = [];
    for (const op of operations.nodes) {
      if (op.operationHash) {
        items.push(op.operationHash);
      }
    }
    return items;
  }

  const [selectedItems, setSelectedItems] = useState<string[]>(() =>
    selected?.length ? selected : getOperationHashes(),
  );

  const onSelect = useCallback(
    (operationHash: string, selected: boolean) => {
      const itemAt = selectedItems.findIndex(hash => hash === operationHash);
      const exists = itemAt > -1;

      if (selected && !exists) {
        setSelectedItems([...selectedItems, operationHash]);
      } else if (!selected && exists) {
        setSelectedItems(selectedItems.filter(hash => hash !== operationHash));
      }
    },
    [selectedItems, setSelectedItems],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedFilter = useDebouncedCallback((value: string) => {
    setVisibleOperations(
      operations.nodes.filter(op =>
        op.name.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
      ),
    );
  }, 500);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.currentTarget;

      setSearchTerm(value);
      debouncedFilter(value);
    },
    [setSearchTerm, debouncedFilter],
  );

  const [visibleOperations, setVisibleOperations] = useState(operations.nodes);

  const selectAll = useCallback(() => {
    setSelectedItems(getOperationHashes());
  }, [operations]);
  const selectNone = useCallback(() => {
    setSelectedItems([]);
  }, [setSelectedItems]);

  const renderRow = useCallback<ComponentType<ListChildComponentProps>>(
    ({ index, style }) => {
      const operation = visibleOperations[index];

      return (
        <OperationRow
          style={style}
          key={operation.id}
          operationStats={operation}
          selected={selectedItems.includes(operation.operationHash || '')}
          onSelect={onSelect}
        />
      );
    },
    [visibleOperations, selectedItems, onSelect],
  );

  return (
    <Drawer open={isOpen} onOpenChange={onClose} width={500}>
      <Drawer.Title>Filter by operation</Drawer.Title>

      <div className="flex flex-col h-full space-y-3">
        <Input
          size="medium"
          placeholder="Search for operation..."
          onChange={onChange}
          value={searchTerm}
          onClear={() => {
            setSearchTerm('');
            setVisibleOperations(operations.nodes);
          }}
        />
        <div className="flex gap-2 items-center w-full">
          <Button variant="link" onClick={selectAll}>
            All
          </Button>
          <Button variant="link" onClick={selectNone}>
            None
          </Button>
          <Button className="ml-auto" onClick={selectAll}>
            Reset
          </Button>
          <Button
            variant="primary"
            disabled={selectedItems.length === 0}
            onClick={() => {
              onFilter(selectedItems);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
        <div className="pl-1 grow">
          <AutoSizer>
            {({ height, width }) =>
              !height || !width ? (
                <></>
              ) : (
                <FixedSizeList
                  height={height}
                  width={width}
                  itemCount={visibleOperations.length}
                  itemSize={24}
                  overscanCount={5}
                >
                  {renderRow}
                </FixedSizeList>
              )
            }
          </AutoSizer>
        </div>
      </div>
    </Drawer>
  );
}

const OperationsFilterContainer_OperationStatsQuery = graphql(`
  query OperationsFilterContainer_OperationStatsQuery($selector: OperationsStatsSelectorInput!) {
    operationsStats(selector: $selector) {
      operations {
        ...OperationsFilter_OperationStatsConnectionFragment
        total
      }
    }
  }
`);

function OperationsFilterContainer({
  period,
  isOpen,
  onClose,
  onFilter,
  selected,
}: {
  onFilter(keys: string[]): void;
  onClose(): void;
  isOpen: boolean;
  period: DateRangeInput;
  selected?: string[];
}): ReactElement | null {
  const router = useRouteSelector();
  const [query] = useQuery({
    query: OperationsFilterContainer_OperationStatsQuery,
    variables: {
      selector: {
        organization: router.organizationId,
        project: router.projectId,
        target: router.targetId,
        period,
        operations: [],
      },
    },
  });

  if (!isOpen) {
    return null;
  }

  if (query.fetching || query.error || !query.data) {
    return <Spinner />;
  }

  return (
    <OperationsFilter
      operationStatsConnection={query.data.operationsStats?.operations}
      selected={selected}
      isOpen={isOpen}
      onClose={onClose}
      onFilter={hashes => {
        onFilter(hashes.length === query.data?.operationsStats.operations.total ? [] : hashes);
      }}
    />
  );
}

const OperationRow_OperationStatsFragment = graphql(`
  fragment OperationRow_OperationStatsFragment on OperationStats {
    id
    name
    operationHash
    count
  }
`);

function OperationRow({
  operationStats,
  selected,
  onSelect,
  style,
}: {
  operationStats: FragmentType<typeof OperationRow_OperationStatsFragment>;
  selected: boolean;
  onSelect(id: string, selected: boolean): void;
  style: any;
}): ReactElement {
  const operation = useFragment(OperationRow_OperationStatsFragment, operationStats);
  const requests = useFormattedNumber(operation.count);
  const hash = operation.operationHash || '';
  const change = useCallback(() => {
    if (hash) {
      onSelect(hash, !selected);
    }
  }, [onSelect, hash, selected]);

  return (
    <div style={style} className="flex items-center gap-4 truncate">
      <Checkbox checked={selected} onCheckedChange={change} id={hash} />
      <label
        htmlFor={hash}
        className="flex items-center justify-between overflow-hidden gap-4 w-full cursor-pointer"
      >
        <span className="grow text-ellipsis overflow-hidden">{operation.name}</span>
        <div className="shrink-0 text-right text-gray-500">{requests}</div>
      </label>
    </div>
  );
}

export function OperationsFilterTrigger({
  period,
  onFilter,
  selected,
}: {
  period: DateRangeInput;
  onFilter(keys: string[]): void;
  selected?: string[];
}): ReactElement {
  const [isOpen, toggle] = useToggle();

  return (
    <>
      <Button variant="secondary" className="gap-2 rounded-md" onClick={toggle}>
        Operations ({selected?.length || 'all'})<ChevronUpIcon className="rotate-180" />
      </Button>
      <OperationsFilterContainer
        isOpen={isOpen}
        onClose={toggle}
        period={period}
        selected={selected}
        onFilter={onFilter}
      />
    </>
  );
}

const ClientRow_ClientStatsFragment = graphql(`
  fragment ClientRow_ClientStatsFragment on ClientStats {
    name
    count
  }
`);

function ClientRow({
  selected,
  onSelect,
  style,
  ...props
}: {
  client: FragmentType<typeof ClientRow_ClientStatsFragment>;
  selected: boolean;
  onSelect(id: string, selected: boolean): void;
  style: any;
}): ReactElement {
  const client = useFragment(ClientRow_ClientStatsFragment, props.client);
  const requests = useFormattedNumber(client.count);
  const hash = client.name;
  const change = useCallback(() => {
    if (hash) {
      onSelect(hash, !selected);
    }
  }, [onSelect, hash, selected]);

  return (
    <div style={style} className="flex items-center gap-4 truncate">
      <Checkbox checked={selected} onCheckedChange={change} id={hash} />
      <label
        htmlFor={hash}
        className="flex items-center justify-between overflow-hidden gap-4 w-full cursor-pointer"
      >
        <span className="grow text-ellipsis overflow-hidden">{client.name}</span>
        <div className="shrink-0 text-right text-gray-500">{requests}</div>
      </label>
    </div>
  );
}

const ClientsFilter_ClientStatsConnectionFragment = graphql(`
  fragment ClientsFilter_ClientStatsConnectionFragment on ClientStatsConnection {
    nodes {
      name
      ...ClientRow_ClientStatsFragment
    }
  }
`);

function ClientsFilter({
  onClose,
  isOpen,
  onFilter,
  clientStatsConnection,
  selected,
}: {
  onClose(): void;
  onFilter(keys: string[]): void;
  isOpen: boolean;
  clientStatsConnection: FragmentType<typeof ClientsFilter_ClientStatsConnectionFragment>;
  selected?: string[];
}): ReactElement {
  const clientConnection = useFragment(
    ClientsFilter_ClientStatsConnectionFragment,
    clientStatsConnection,
  );
  function getClientNames() {
    return clientConnection.nodes.map(client => client.name);
  }

  const [selectedItems, setSelectedItems] = useState<string[]>(() =>
    selected?.length ? selected : getClientNames(),
  );

  const onSelect = useCallback(
    (operationHash: string, selected: boolean) => {
      const itemAt = selectedItems.findIndex(hash => hash === operationHash);
      const exists = itemAt > -1;

      if (selected && !exists) {
        setSelectedItems([...selectedItems, operationHash]);
      } else if (!selected && exists) {
        setSelectedItems(selectedItems.filter(hash => hash !== operationHash));
      }
    },
    [selectedItems, setSelectedItems],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedFilter = useDebouncedCallback((value: string) => {
    setVisibleOperations(
      clientConnection.nodes.filter(client =>
        client.name.toLocaleLowerCase().includes(value.toLocaleLowerCase()),
      ),
    );
  }, 500);

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.currentTarget;

      setSearchTerm(value);
      debouncedFilter(value);
    },
    [setSearchTerm, debouncedFilter],
  );

  const [visibleOperations, setVisibleOperations] = useState(clientConnection.nodes);

  const selectAll = useCallback(() => {
    setSelectedItems(getClientNames());
  }, [clientConnection.nodes]);
  const selectNone = useCallback(() => {
    setSelectedItems([]);
  }, [setSelectedItems]);

  const renderRow = useCallback<ComponentType<ListChildComponentProps>>(
    ({ index, style }) => {
      const client = visibleOperations[index];

      return (
        <ClientRow
          style={style}
          key={client.name}
          client={client}
          selected={selectedItems.includes(client.name || '')}
          onSelect={onSelect}
        />
      );
    },
    [visibleOperations, selectedItems, onSelect],
  );

  return (
    <Drawer open={isOpen} onOpenChange={onClose} width={500}>
      <Drawer.Title>Filter by client</Drawer.Title>

      <div className="flex flex-col h-full space-y-3">
        <Input
          size="medium"
          placeholder="Search for operation..."
          onChange={onChange}
          value={searchTerm}
          onClear={() => {
            setSearchTerm('');
            setVisibleOperations(clientConnection.nodes);
          }}
        />
        <div className="flex gap-2 items-center w-full">
          <Button variant="link" onClick={selectAll}>
            All
          </Button>
          <Button variant="link" onClick={selectNone}>
            None
          </Button>
          <Button className="ml-auto" onClick={selectAll}>
            Reset
          </Button>
          <Button
            variant="primary"
            disabled={selectedItems.length === 0}
            onClick={() => {
              onFilter(selectedItems);
              onClose();
            }}
          >
            Save
          </Button>
        </div>
        <div className="pl-1 grow">
          <AutoSizer>
            {({ height, width }) =>
              !height || !width ? (
                <></>
              ) : (
                <FixedSizeList
                  height={height}
                  width={width}
                  itemCount={visibleOperations.length}
                  itemSize={24}
                  overscanCount={5}
                >
                  {renderRow}
                </FixedSizeList>
              )
            }
          </AutoSizer>
        </div>
      </div>
    </Drawer>
  );
}

const ClientsFilterContainer_ClientStatsQuery = graphql(`
  query ClientsFilterContainer_ClientStats($selector: OperationsStatsSelectorInput!) {
    operationsStats(selector: $selector) {
      clients {
        ...ClientsFilter_ClientStatsConnectionFragment
        nodes {
          __typename
        }
      }
    }
  }
`);

function ClientsFilterContainer({
  period,
  isOpen,
  onClose,
  onFilter,
  selected,
}: {
  onFilter(keys: string[]): void;
  onClose(): void;
  isOpen: boolean;
  period: DateRangeInput;
  selected?: string[];
}): ReactElement | null {
  const router = useRouteSelector();
  const [query] = useQuery({
    query: ClientsFilterContainer_ClientStatsQuery,
    variables: {
      selector: {
        organization: router.organizationId,
        project: router.projectId,
        target: router.targetId,
        period,
        operations: [],
      },
    },
  });

  if (!isOpen) {
    return null;
  }

  if (query.fetching || query.error || !query.data) {
    return <Spinner />;
  }

  const allClients = query.data.operationsStats?.clients.nodes ?? [];

  return (
    <ClientsFilter
      clientStatsConnection={query.data.operationsStats.clients}
      selected={selected}
      isOpen={isOpen}
      onClose={onClose}
      onFilter={clientNames => {
        onFilter(clientNames.length === allClients.length ? [] : clientNames);
      }}
    />
  );
}

export function ClientsFilterTrigger({
  period,
  onFilter,
  selected,
}: {
  period: DateRangeInput;
  onFilter(keys: string[]): void;
  selected?: string[];
}): ReactElement {
  const [isOpen, toggle] = useToggle();

  return (
    <>
      <Button variant="secondary" className="gap-2 rounded-md" onClick={toggle}>
        Clients ({selected?.length || 'all'})<ChevronUpIcon className="rotate-180" />
      </Button>
      <ClientsFilterContainer
        isOpen={isOpen}
        onClose={toggle}
        period={period}
        selected={selected}
        onFilter={onFilter}
      />
    </>
  );
}
