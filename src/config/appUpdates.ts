/**
 * Novedades de la aplicación — se muestran una vez por usuario al iniciar sesión.
 *
 * Publicar desde la app (Calidad o Administrativo):
 * MainMenu → panel «Novedades» → botón ⊕ → formulario «Publicar novedad».
 *
 * Publicar por código (opcional, para desarrolladores):
 * Agrega un objeto al array APP_UPDATES; se combina con las de Firestore (colección appNovedades).
 */

export interface AppUpdate {
  /** Identificador único e inmutable. No reutilizar ids viejos. */
  id: string;
  /** Fecha de publicación (YYYY-MM-DD), solo informativa. */
  date: string;
  title: string;
  summary: string;
  /** Pasos o puntos de "cómo se usa". */
  highlights: string[];
  /** Id de pantalla en MainApp / MainMenu (ej. solicitud-vacaciones). */
  screenId?: string;
  /** Texto del botón de ir a la pantalla. */
  screenLabel?: string;
  /** Si se define, solo usuarios con alguno de estos roles/puestos ven el aviso. */
  roles?: string[];
}

export const APP_UPDATES: AppUpdate[] = [
  {
    id: '2025-06-vacaciones',
    date: '2025-06-05',
    title: 'Nueva pantalla: Solicitud de Vacaciones',
    summary:
      'Ya puedes solicitar y dar seguimiento a tus vacaciones desde la aplicación, con flujo de autorización y notificaciones.',
    highlights: [
      'En el menú principal, abre la tarjeta «Vacaciones».',
      'En «Nueva solicitud» indica días, fecha de inicio y fin, y envía tu solicitud.',
      'En «Mis solicitudes» consulta el estado y descarga el PDF cuando esté aprobada.',
      'Si eres autorizador, revisa las pendientes en la pestaña «Por autorizar».',
    ],
    screenId: 'solicitud-vacaciones',
    screenLabel: 'Ir a Vacaciones',
  },
];
