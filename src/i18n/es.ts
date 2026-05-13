// Spanish translations for the inventory system
export const es = {
  // Navigation
  nav: {
    home: 'Inicio',
    products: 'Productos',
    customers: 'Clientes',
    sales: 'Ventas',
    scanner: 'Escáner',
    qrGenerator: 'Códigos QR',
    transactions: 'Transacciones',
    reports: 'Reportes',
    settings: 'Configuración',
  },

  // Common actions
  actions: {
    add: 'Agregar',
    edit: 'Editar',
    modify: 'Modificar',
    undo: 'Deshacer',
    delete: 'Eliminar',
    save: 'Guardar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    search: 'Buscar',
    filter: 'Filtrar',
    clear: 'Limpiar',
    export: 'Exportar',
    import: 'Importar',
    back: 'Volver',
    close: 'Cerrar',
    view: 'Ver',
    select: 'Seleccionar',
  },

  // Products
  products: {
    title: 'Productos',
    addProduct: 'Agregar Producto',
    editProduct: 'Editar Producto',
    productName: 'Nombre del Producto',
    sku: 'Código (SKU)',
    upsBatch: 'Número de UPS',
    quantity: 'Cantidad',
    unitPrice: 'Precio Unitario',
    category: 'Categoría',
    brand: 'Marca',
    color: 'Color',
    size: 'Talla',
    description: 'Descripción / Observaciones',
    status: 'Estado',
    available: 'Disponible',
    sold: 'Vendido',
    reserved: 'Reservado',
    markAsSold: 'Marcar como Vendido',
    deleteConfirm: '¿Está seguro que desea eliminar este producto?',
    noProducts: 'No hay productos registrados',
    searchPlaceholder: 'Buscar por nombre, marca o código...',
    // New translations for sell flow
    sellProduct: 'Vender Producto',
    availableProducts: 'Productos Disponibles',
    soldProducts: 'Productos Vendidos',
    soldTo: 'Vendido a',
    soldDate: 'Fecha de Venta',
    paymentStatus: 'Estado de Pago',
    paid: 'Pagado',
    pending: 'Pendiente',
    owes: 'Debe',
    saleDetails: 'Detalles de Venta',
    paymentBreakdown: 'Desglose de Pago',
    selectUps: 'Seleccionar UPS',
    selectCategory: 'Seleccionar Categoría',
    productsFound: 'productos encontrados',
    clearFilters: 'Limpiar filtros',
    addToCart: 'Agregar al carrito',
    productAdded: 'Producto agregado',
  },

  // Customers
  customers: {
    title: 'Clientes',
    addCustomer: 'Agregar Cliente',
    editCustomer: 'Editar Cliente',
    customerName: 'Nombre del Cliente',
    phone: 'Teléfono',
    email: 'Correo Electrónico',
    balance: 'Saldo Pendiente',
    totalPurchases: 'Total de Compras',
    noCustomers: 'No hay clientes registrados',
    walkIn: 'Cliente de Paso',
    deleteConfirm: '¿Está seguro que desea eliminar este cliente?',
    searchPlaceholder: 'Buscar por nombre o teléfono...',
    viewAccount: 'Ver Cuenta',
    purchaseHistory: 'Historial de Compras',
  },

  // Sales
  sales: {
    title: 'Ventas',
    newSale: 'Nueva Venta',
    registerSale: 'Registrar Venta',
    selectCustomer: 'Seleccionar Cliente',
    selectProduct: 'Seleccionar Producto',
    quantity: 'Cantidad',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    total: 'Total',
    paymentMethod: 'Método de Pago',
    cash: 'Efectivo',
    transfer: 'Transferencia',
    card: 'Tarjeta',
    mixed: 'Pago Mixto',
    credit: 'Crédito (Abono)',
    installment: 'Abono',
    receiveInstallment: 'Recibir Abono',
    installmentAmount: 'Monto del Abono',
    remainingBalance: 'Saldo Restante',
    notes: 'Notas / Observaciones',
    saleCompleted: '¡Venta registrada exitosamente!',
    paymentReceived: '¡Pago recibido exitosamente!',
  },

  // Transactions
  transactions: {
    title: 'Historial de Transacciones',
    date: 'Fecha',
    customer: 'Cliente',
    product: 'Producto',
    amount: 'Monto',
    paymentMethod: 'Método de Pago',
    type: 'Tipo',
    sale: 'Venta',
    return: 'Devolución',
    adjustment: 'Ajuste',
    installmentPayment: 'Pago de Abono',
    noTransactions: 'No hay transacciones registradas',
    filterByDate: 'Filtrar por Fecha',
    filterByCustomer: 'Filtrar por Cliente',
    filterByPayment: 'Filtrar por Método de Pago',
    editSaleTitle: 'Modificar Venta',
    saleTypeLabel: 'Venta',
    addProductsLabel: 'Agregar o quitar productos',
    productLabel: 'Producto',
    selectUpsPlaceholder: 'Filtrar por UPS...',
    selectProductPlaceholder: 'Seleccionar producto...',
    noProductsForUps: 'No hay productos disponibles para este UPS.',
    onlyUpsProductsNote: 'Solo se muestran productos con número de UPS asignado.',
    unregisteredLineLabel: 'Sin registrar',
    unitPriceLabel: 'Precio unitario',
    lineTotalLabel: 'Total de linea',
    atLeastOneItemRequired: 'La transacción debe tener al menos un producto.',
    paidLabel: 'Pagado',
    pendingLabel: 'Pendiente',
    autoSettlementNotice: 'Ajuste automatico para mantenerla liquidada:',
    loadMoreTransactions: 'Cargar 5 mas',
    modifyConfirmTitle: 'Modificar transacción',
    modifyConfirmMessage:
      '¿Seguro que deseas modificar esta transacción? Esto actualizará inventario y saldos.',
    undoConfirmTitle: 'Deshacer transacción',
    undoConfirmMessage:
      '¿Seguro que deseas deshacer esta transacción? Esto restaurará inventario y saldos.',
    pendingSyncSuffix: 'cambio(s) pendiente(s) de sincronizar antes de modificar.',
    failedSyncSuffix: 'operacion(es) fallida(s). Reintenta sincronizar antes de modificar.',
  },

  // Reports
  reports: {
    title: 'Reportes',
    todaySales: 'Ventas de Hoy',
    weeklySales: 'Ventas de la Semana',
    monthlySales: 'Ventas del Mes',
    salesByCategory: 'Ventas por Categoría',
    salesByPaymentMethod: 'Ventas por Método de Pago',
    outstandingBalances: 'Saldos Pendientes',
    topProducts: 'Productos Más Vendidos',
    topCustomers: 'Mejores Clientes',
    totalInventoryValue: 'Valor Total del Inventario',
  },

  // Dashboard
  dashboard: {
    title: 'Panel Principal',
    totalProducts: 'Total de Productos',
    inventoryValue: 'Valor del Inventario',
    todaysSales: 'Ventas de Hoy',
    outstandingBalance: 'Saldos Pendientes',
    recentTransactions: 'Transacciones Recientes',
    quickActions: 'Acciones Rápidas',
  },

  // Settings
  settings: {
    title: 'Configuración',
    general: 'General',
    importExport: 'Importar / Exportar',
    backup: 'Respaldo',
    importFromExcel: 'Importar desde Excel',
    exportToExcel: 'Exportar a Excel',
    createBackup: 'Crear Respaldo',
    restoreBackup: 'Restaurar Respaldo',
    cardFeePercentage: 'Comisión de Tarjeta (%)',
    manageBrands: 'Administrar Marcas',
    manageColors: 'Administrar Colores',
    dataImported: '¡Datos importados exitosamente!',
    backupCreated: '¡Respaldo creado exitosamente!',
    backupRestored: '¡Respaldo restaurado exitosamente!',
  },

  // Validation messages
  validation: {
    required: 'Este campo es requerido',
    invalidEmail: 'Correo electrónico inválido',
    invalidPhone: 'Teléfono inválido',
    minValue: 'El valor mínimo es {min}',
    maxValue: 'El valor máximo es {max}',
    positiveNumber: 'Debe ser un número positivo',
    selectProduct: 'Por favor seleccione un producto',
    selectCustomer: 'Por favor seleccione un cliente',
    enterAmount: 'Por favor ingrese el monto',
  },

  // Success messages
  success: {
    productAdded: '¡Producto agregado exitosamente!',
    productUpdated: '¡Producto actualizado exitosamente!',
    productDeleted: '¡Producto eliminado exitosamente!',
    customerAdded: '¡Cliente agregado exitosamente!',
    customerUpdated: '¡Cliente actualizado exitosamente!',
    customerDeleted: '¡Cliente eliminado exitosamente!',
    saleCompleted: '¡Venta registrada exitosamente!',
    paymentReceived: '¡Pago recibido exitosamente!',
    transactionModified: '¡Transacción modificada exitosamente!',
    transactionUndone: '¡Transacción deshecha exitosamente!',
  },

  // Error messages
  errors: {
    genericError: 'Ha ocurrido un error. Por favor intente de nuevo.',
    loadError: 'Error al cargar los datos.',
    saveError: 'Error al guardar los datos.',
    deleteError: 'Error al eliminar.',
    importError: 'Error al importar los datos.',
    exportError: 'Error al exportar los datos.',
    notEnoughStock: 'No hay suficiente stock disponible.',
    invalidAmount: 'El monto ingresado no es válido.',
    transactionModifyRpcMissing:
      'La funcion de modificacion no existe en la base de datos. Aplica migraciones.',
    transactionModifyPaidFloor:
      'No se puede guardar: el total no puede ser menor al monto ya pagado.',
    transactionModifyInsufficientStock:
      'No hay inventario suficiente para aplicar este cambio.',
    transactionModifySoldUnderflow:
      'No se puede reducir mas cantidad vendida para uno de los productos.',
    transactionModifyInvalidPayload:
      'La modificacion contiene datos invalidos o no permitidos.',
    transactionModifyRequiresOnline:
      'Necesitas conexión activa para modificar una transacción.',
    transactionModifyPendingSync:
      'Hay cambios pendientes por sincronizar. Intenta de nuevo en unos segundos.',
    transactionModifyDeadLetter:
      'Hay operaciones fallidas de sincronizacion. Reintenta antes de modificar.',
    transactionModifyRefreshWarning:
      'La venta se modificó en la base de datos, pero no se pudo recargar toda la información. Actualiza la vista para verificar.',
    transactionUndoRpcMissing:
      'La funcion para deshacer transacciones no existe en la base de datos. Aplica migraciones.',
    transactionUndoSoldUnderflow:
      'No se puede deshacer: la cantidad vendida actual es menor a la de la transacción.',
    transactionUndoNotFound:
      'La transacción ya no existe o ya fue deshecha.',
    transactionUndoRequiresOnline:
      'Necesitas conexión activa para deshacer una transacción.',
    transactionUndoPendingSync:
      'Hay cambios pendientes por sincronizar. Intenta de nuevo en unos segundos.',
    transactionUndoDeadLetter:
      'Hay operaciones fallidas de sincronizacion. Reintenta antes de deshacer.',
    transactionUndoRefreshWarning:
      'No se pudo recargar todo desde la base de datos; actualiza la vista para verificar.',
  },

  // Confirmations
  confirm: {
    delete: '¿Está seguro que desea eliminar este registro?',
    cancel: '¿Está seguro que desea cancelar? Se perderán los cambios.',
    restore: '¿Está seguro que desea restaurar el respaldo? Esto reemplazará todos los datos actuales.',
  },
};

export type TranslationKey = keyof typeof es;
