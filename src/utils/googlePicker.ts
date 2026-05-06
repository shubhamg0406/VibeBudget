export interface PickedSheet {
  id: string;
  name: string;
  url: string;
}

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

function loadGapiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.gapi) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load gapi script"));
    document.head.appendChild(script);
  });
}

function loadPickerApi(): Promise<void> {
  return new Promise((resolve) => {
    window.gapi.load("picker", () => resolve());
  });
}

export async function openGoogleSheetPicker(
  accessToken: string,
  apiKey?: string
): Promise<PickedSheet | null> {
  await loadGapiScript();
  await loadPickerApi();

  return new Promise((resolve) => {
    const cb = (data: any) => {
      const { Action, Document } = window.google.picker;
      if (data.action === Action.PICKED) {
        const doc = data[Document.DOCUMENTS][0];
        resolve({
          id: doc[Document.ID],
          name: doc[Document.NAME],
          url: "https://docs.google.com/spreadsheets/d/" + doc[Document.ID],
        });
      } else if (data.action === Action.CANCEL) {
        resolve(null);
      }
    };

    let builder = new window.google.picker.PickerBuilder()
      .addView(new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS))
      .setOAuthToken(accessToken)
      .setCallback(cb);

    if (apiKey) builder = builder.setDeveloperKey(apiKey);

    builder.build().setVisible(true);
  });
}
