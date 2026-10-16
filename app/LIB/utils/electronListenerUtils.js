export const getElectronListenerCleanup = (subscription) => {
  if (typeof subscription === "function") {
    return subscription;
  }

  if (
    subscription &&
    typeof subscription === "object" &&
    typeof subscription.unsubscribe === "function"
  ) {
    return () => subscription.unsubscribe();
  }

  if (
    subscription &&
    typeof subscription === "object" &&
    typeof subscription.dispose === "function"
  ) {
    return () => subscription.dispose();
  }

  if (
    subscription &&
    typeof subscription === "object" &&
    typeof subscription.off === "function"
  ) {
    return () => subscription.off();
  }

  return undefined;
};
