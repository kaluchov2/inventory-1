import { useEffect, useState } from 'react';
import { Icon, Text, Spinner, Badge, Tooltip } from '@chakra-ui/react';
import { FiCloud, FiCloudOff, FiWifiOff, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { syncManager, SyncStatus as SyncStatusType } from '../../lib/syncManager';
import { connectionStatus, ConnectionStatus } from '../../lib/connectionStatus';
import { useAuthStore } from '../../store/authStore';

/**
 * SyncStatus Component
 * Shows sync progress, connection status, and pending changes
 */
export function SyncStatus() {
  const { isOfflineMode } = useAuthStore();
  const [syncStatus, setSyncStatus] = useState<SyncStatusType>(syncManager.getStatus());
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(connectionStatus.getStatus());

  useEffect(() => {
    const unsubSync = syncManager.subscribe(setSyncStatus);
    const unsubConn = connectionStatus.subscribe(setConnStatus);

    return () => {
      unsubSync();
      unsubConn();
    };
  }, []);

  if (isOfflineMode) {
    return (
      <Tooltip label="Modo sin conexión - Los datos solo se guardan localmente">
        <Badge colorScheme="orange" display="flex" alignItems="center" gap={2} px={3} py={1}>
          <Icon as={FiWifiOff} />
          <Text fontSize="sm">Modo sin conexión</Text>
        </Badge>
      </Tooltip>
    );
  }

  if (!connStatus.isOnline) {
    return (
      <Tooltip label="Sin conexión a Internet">
        <Badge colorScheme="red" display="flex" alignItems="center" gap={2} px={3} py={1}>
          <Icon as={FiWifiOff} />
          <Text fontSize="sm">Sin conexión</Text>
        </Badge>
      </Tooltip>
    );
  }

  if (!connStatus.isSupabaseConnected) {
    return (
      <Tooltip label="No se puede conectar a la base de datos">
        <Badge colorScheme="red" display="flex" alignItems="center" gap={2} px={3} py={1}>
          <Icon as={FiCloudOff} />
          <Text fontSize="sm">DB desconectada</Text>
        </Badge>
      </Tooltip>
    );
  }

  if (syncStatus.isSyncing) {
    return (
      <Tooltip label="Sincronizando cambios...">
        <Badge colorScheme="blue" display="flex" alignItems="center" gap={2} px={3} py={1}>
          <Spinner size="xs" />
          <Text fontSize="sm">Sincronizando...</Text>
        </Badge>
      </Tooltip>
    );
  }

  if (syncStatus.deadLetterCount > 0) {
    return (
      <Tooltip label={`${syncStatus.deadLetterCount} operación(es) fallaron — toca para reintentar`}>
        <Badge
          colorScheme="orange"
          display="flex"
          alignItems="center"
          gap={2}
          px={3}
          py={1}
          cursor="pointer"
          onClick={() => syncManager.retryDeadLetter()}
        >
          <Icon as={FiAlertCircle} />
          <Text fontSize="sm">{syncStatus.deadLetterCount} fallido(s) — Reintentar</Text>
        </Badge>
      </Tooltip>
    );
  }

  if (syncStatus.error) {
    return (
      <Tooltip label={`Error: ${syncStatus.error}`}>
        <Badge colorScheme="red" display="flex" alignItems="center" gap={2} px={3} py={1}>
          <Icon as={FiAlertCircle} />
          <Text fontSize="sm">Error de sincronización</Text>
        </Badge>
      </Tooltip>
    );
  }

  if (syncStatus.pendingCount > 0) {
    return (
      <Tooltip label={`${syncStatus.pendingCount} cambios pendientes de sincronizar`}>
        <Badge colorScheme="yellow" display="flex" alignItems="center" gap={2} px={3} py={1}>
          <Icon as={FiCloud} />
          <Text fontSize="sm">{syncStatus.pendingCount} pendiente(s)</Text>
        </Badge>
      </Tooltip>
    );
  }

  const lastSyncText = syncStatus.lastSync
    ? `Última sincronización: ${formatRelativeTime(syncStatus.lastSync)}`
    : 'Sincronizado con la nube';

  return (
    <Tooltip label={lastSyncText}>
      <Badge colorScheme="green" display="flex" alignItems="center" gap={2} px={3} py={1}>
        <Icon as={FiCheckCircle} />
        <Text fontSize="sm">Sincronizado</Text>
      </Badge>
    </Tooltip>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'hace un momento';
  if (diffMins === 1) return 'hace 1 minuto';
  if (diffMins < 60) return `hace ${diffMins} minutos`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return 'hace 1 hora';
  if (diffHours < 24) return `hace ${diffHours} horas`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'hace 1 día';
  return `hace ${diffDays} días`;
}
