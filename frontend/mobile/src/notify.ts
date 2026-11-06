import * as Notifications from "expo-notifications";

let configured = false;

/** Показувати сповіщення й тоді, коли застосунок відкритий: витрату щойно додали саме в ньому. */
function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Локальне сповіщення — без сервера пушів, одразу на пристрої.
 *
 * Повертає false, якщо показати не вийшло (немає дозволу, Expo Go без
 * підтримки): тоді попередження треба показати в самому застосунку, а не
 * загубити.
 */
export async function notifyLocally(title: string, body: string): Promise<boolean> {
  try {
    configure();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== "granted") return false;
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
    return true;
  } catch {
    return false;
  }
}
