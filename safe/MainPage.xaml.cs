namespace safe;

// Hosts the hub's live console. Positions, alerts and the 3D twin all come from the hub
// (see hub/ in this repo), so the phone shows exactly what the control room sees.
public partial class MainPage : ContentPage
{
    const string HubKey = "hubUrl";
    // The deployed hub. The app opens straight onto it; the address screen only appears if
    // it can't be reached (then you can point it at a local hub instead).
    const string DefaultHub = "http://45.79.206.183:7000/";
    bool loaded;

    public MainPage()
    {
        InitializeComponent();
        HubUrl.Text = Preferences.Get(HubKey, DefaultHub);

        // A monitoring screen must not go dark in someone's hand.
        DeviceDisplay.Current.KeepScreenOn = true;

        Load(HubUrl.Text);
    }

    void OnConnect(object sender, EventArgs e)
    {
        var url = Normalise(HubUrl.Text);
        if (url is null)
        {
            ShowStatus($"Enter the hub address, for example {DefaultHub}");
            return;
        }
        HubUrl.Text = url;
        Preferences.Set(HubKey, url);
        Load(url);
    }

    void Load(string url)
    {
        loaded = false;
        Busy.IsVisible = Busy.IsRunning = true;
        ConnectButton.IsEnabled = false;
        StatusCard.IsVisible = false;
        Console.Source = url;
    }

    void OnNavigating(object sender, WebNavigatingEventArgs e)
    {
        // Keep the console in the app, send anything else (docs, maps) to the browser.
        var hub = Preferences.Get(HubKey, DefaultHub);
        if (loaded && !string.IsNullOrEmpty(hub) && !e.Url.StartsWith(hub, StringComparison.OrdinalIgnoreCase))
        {
            e.Cancel = true;
            _ = Launcher.OpenAsync(e.Url);
        }
    }

    void OnNavigated(object sender, WebNavigatedEventArgs e)
    {
        Busy.IsVisible = Busy.IsRunning = false;
        ConnectButton.IsEnabled = true;

        if (e.Result == WebNavigationResult.Success)
        {
            loaded = true;
            Connect.IsVisible = false;
            return;
        }

        Connect.IsVisible = true;
        ShowStatus($"Couldn't reach the hub at {e.Url}. Check the phone is on the same network as the hub and that the hub is running, then tap Connect.");
    }

    protected override bool OnBackButtonPressed()
    {
        // Back from the console returns to the connection screen instead of closing the app.
        if (!Connect.IsVisible)
        {
            Connect.IsVisible = true;
            StatusCard.IsVisible = false;
            return true;
        }
        return base.OnBackButtonPressed();
    }

    void ShowStatus(string text)
    {
        Status.Text = text;
        StatusCard.IsVisible = true;
    }

    static string? Normalise(string? raw)
    {
        raw = raw?.Trim();
        if (string.IsNullOrEmpty(raw)) return null;
        if (!raw.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            raw = "http://" + raw;
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri)) return null;
        return uri.GetLeftPart(UriPartial.Path).TrimEnd('/') + "/";
    }
}
