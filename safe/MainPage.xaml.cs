using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;
using Microsoft.Maui.Controls;
using Microsoft.Maui.Graphics;
using Microsoft.Maui.Controls.Shapes;
using Microsoft.Maui.Layouts;
using MQTTnet;
using MQTTnet.Client;

namespace safe
{
    public partial class MainPage : ContentPage
    {
        readonly Dictionary<string, (View container, Frame popup)> entities = new();
        readonly Dictionary<string, Queue<Point>> trails = new();
        readonly List<float> activityValues = new();

        IMqttClient mqttClient;
        CancellationTokenSource cts;

        const string MQTT_HOST = "45.79.206.183";
        const int MQTT_PORT = 1883;
        const string MQTT_TOPIC = "/mapper/data";

        const double MapWidth = 360;
        const double MapHeight = 500;

        const double ROOM_WIDTH_RAW = 3000.0;
        const double ROOM_HEIGHT_RAW = 3000.0;

        ActivityGraphDrawable graphDrawable;

        int lastGesture = -1;
        int lastMotion = -1;

        public MainPage()
        {
            InitializeComponent();

            cts = new CancellationTokenSource();

            graphDrawable = new ActivityGraphDrawable();
            ActivityGraphView.Drawable = graphDrawable;

            // ✅ EXACTLY THREE ANCHORS — A, B, C
            CreateAnchor("A", -10, -10);
            CreateAnchor("B", MapWidth - 55, -10);
            CreateAnchor("C", -10, MapHeight - 110);

            CreateSubject("Person-1", 120, 160, "Standing", "Initializing…");

            _ = StartMqttAsync();

            Device.StartTimer(TimeSpan.FromMilliseconds(200), () =>
            {
                if (activityValues.Count == 0)
                    AddActivityValue(0.5f);

                graphDrawable.Values = activityValues;
                ActivityGraphView.Invalidate();
                return true;
            });
        }

        #region MQTT

        async Task StartMqttAsync()
        {
            var factory = new MqttFactory();
            mqttClient = factory.CreateMqttClient();

            mqttClient.ApplicationMessageReceivedAsync += e =>
            {
                HandlePayload(System.Text.Encoding.UTF8.GetString(
                    e.ApplicationMessage.PayloadSegment));
                return Task.CompletedTask;
            };

            var options = new MqttClientOptionsBuilder()
                .WithTcpServer(MQTT_HOST, MQTT_PORT)
                .WithCleanSession()
                .Build();

            await mqttClient.ConnectAsync(options, cts.Token);
            await mqttClient.SubscribeAsync(MQTT_TOPIC);
        }

        void HandlePayload(string payload)
        {
            try
            {
                using var doc = JsonDocument.Parse(payload);
                var root = doc.RootElement;

                string id = "Person-1";

                double temp = root.GetProperty("T").GetDouble();
                double pressure = root.GetProperty("P").GetDouble();
                int gesture = root.GetProperty("G").GetInt32();
                int motion = root.GetProperty("M").GetInt32();

                var u = root.GetProperty("U");
                double rawX = u[0].GetDouble();
                double rawY = u[1].GetDouble();

                double x = MapWidth * (rawX / ROOM_WIDTH_RAW);
                double y = MapHeight * (rawY / ROOM_HEIGHT_RAW);

                x = Math.Clamp(x, 0, MapWidth - 56);
                y = Math.Clamp(y, 0, MapHeight - 56);

                if (!trails.ContainsKey(id))
                    trails[id] = new Queue<Point>();

                var q = trails[id];
                q.Enqueue(new Point(x, y));
                if (q.Count > 18) q.Dequeue();

                // 📈 EVENT-BASED ACTIVITY
                if (gesture != lastGesture)
                {
                    AddActivityValue(2.0f);
                    lastGesture = gesture;
                }

                if (motion == 1 && lastMotion != 1)
                    AddActivityValue(4.0f);
                else
                    AddActivityValue(0.5f);

                lastMotion = motion;

                string posture = gesture == 1 ? "🧍 Standing" : "🛌 Lying";
                string motionText = motion == 1 ? "🏃 Moving" : "⏸ Still";

                string[] extras =
                {
                    "Person-1",
                    posture,
                    $"🌡 {temp:F1} °C",
                    $"⏲ {pressure:F0} hPa",
                    motionText
                };

                UpdateEntityPosition(id, x, y, extras);

                // Add motion trace dot at center of subject icon (56x56)
                AddMotionTrace(x + 28, y + 28);
            }
            catch { }
        }

        #endregion

        #region UI


        void CreateAnchor(string id, double x, double y)
        {
            var container = new AbsoluteLayout { WidthRequest = 48, HeightRequest = 48 };

            var pulse = new Ellipse
            {
                WidthRequest = 96,
                HeightRequest = 96,
                Fill = new SolidColorBrush(Color.FromArgb("#2A8F64")),
                Opacity = 0.18
            };
            AbsoluteLayout.SetLayoutBounds(pulse, new Rect(0.5, 0.5, 96, 96));
            AbsoluteLayout.SetLayoutFlags(pulse, AbsoluteLayoutFlags.PositionProportional);

            var dot = new Ellipse
            {
                WidthRequest = 20,
                HeightRequest = 20,
                Fill = new SolidColorBrush(Color.FromArgb("#00ff84")),
                Stroke = new SolidColorBrush(Color.FromArgb("#88ffffff")),
                StrokeThickness = 1.2
            };
            AbsoluteLayout.SetLayoutBounds(dot, new Rect(0.5, 0.5, 20, 20));
            AbsoluteLayout.SetLayoutFlags(dot, AbsoluteLayoutFlags.PositionProportional);

            var label = new Label
            {
                Text = id,
                TextColor = Colors.White,
                FontSize = 14,
                HorizontalTextAlignment = TextAlignment.Center,
                VerticalTextAlignment = TextAlignment.Center,
                WidthRequest = 20,
                HeightRequest = 20,
                InputTransparent = true
            };
            AbsoluteLayout.SetLayoutBounds(label, new Rect(0.5, 0.5, 20, 20));
            AbsoluteLayout.SetLayoutFlags(label, AbsoluteLayoutFlags.PositionProportional);

            container.Children.Add(pulse);
            container.Children.Add(dot);
            container.Children.Add(label);

            AbsoluteLayout.SetLayoutBounds(container, new Rect(x, y, 48, 48));
            MapLayout.Children.Add(container);

            StartPulseAnimation(pulse);
            entities[id] = (container, null); // No popup for anchors
        }


        void CreateSubject(string id, double x, double y, string posture, string vitals)
        {
            var container = new AbsoluteLayout { WidthRequest = 56, HeightRequest = 56 };

            var pulse = new Ellipse
            {
                WidthRequest = 110,
                HeightRequest = 110,
                Fill = new SolidColorBrush(Color.FromArgb("#C03131")),
                Opacity = 0.14
            };

            var dot = new Ellipse
            {
                WidthRequest = 26,
                HeightRequest = 26,
                Fill = new SolidColorBrush(Color.FromArgb("#ff3b3b")),
                Stroke = new SolidColorBrush(Color.FromArgb("#88ffffff")),
                StrokeThickness = 1.2
            };

            var popup = new Frame
            {
                BackgroundColor = Color.FromRgba(0, 0, 0, 0.75),
                Padding = 8,
                Content = new Label
                {
                    Text = $"{id}\n{posture}\n{vitals}",
                    TextColor = Colors.White,
                    FontSize = 12,
                    WidthRequest = 170
                }
            };

            container.Children.Add(pulse);
            container.Children.Add(dot);
            container.Children.Add(popup);

            AbsoluteLayout.SetLayoutBounds(container, new Rect(x, y, 56, 56));
            MapLayout.Children.Add(container);

            StartPulseAnimation(pulse);
            entities[id] = (container, popup);
        }


        async void StartPulseAnimation(VisualElement pulse)
        {
            while (true)
            {
                await pulse.ScaleTo(1.4, 1200, Easing.SinInOut);
                await pulse.FadeTo(0.05, 600);
                await pulse.ScaleTo(1.0, 1200, Easing.SinOut);
                await pulse.FadeTo(0.18, 600);
            }
        }

        void UpdateEntityPosition(string id, double x, double y, string[] extras)
        {
            if (!entities.TryGetValue(id, out var e)) return;

            MainThread.BeginInvokeOnMainThread(() =>
            {
                AbsoluteLayout.SetLayoutBounds(
                    e.container,
                    new Rect(x, y, e.container.WidthRequest, e.container.HeightRequest));

                if (e.popup.Content is Label lbl)
                    lbl.Text = string.Join("\n", extras);
            });
        }

        // Added: short-lived fading motion trace dot
        void AddMotionTrace(double x, double y)
        {
            var dot = new Ellipse
            {
                WidthRequest = 6,
                HeightRequest = 6,
                Fill = new SolidColorBrush(Color.FromArgb("#55ffffff"))
            };

            AbsoluteLayout.SetLayoutBounds(dot, new Rect(x, y, 6, 6));
            MapLayout.Children.Add(dot);

            _ = dot.FadeTo(0, 600).ContinueWith(_ =>
            {
                MainThread.BeginInvokeOnMainThread(() => MapLayout.Children.Remove(dot));
            });
        }

        #endregion

        #region Activity Graph

        void AddActivityValue(float v)
        {
            activityValues.Add(v);
            if (activityValues.Count > 80)
                activityValues.RemoveAt(0);
        }

        #endregion
    }

    public class ActivityGraphDrawable : IDrawable
    {
        public List<float> Values { get; set; } = new();

        public void Draw(ICanvas canvas, RectF dirtyRect)
        {
            if (Values.Count < 2)
                return;

            float width = dirtyRect.Width;
            float height = dirtyRect.Height;
            float step = width / (Values.Count - 1);

            // Helper to calculate Y position for value i
            float GetY(int i) =>
                height - (Values[i] / 6f * height * 0.6f + 8);

            // Build a smooth path using quadratic Bezier curves
            var path = new PathF();

            path.MoveTo(0, GetY(0));

            for (int i = 1; i < Values.Count; i++)
            {
                float x0 = (i - 1) * step;
                float y0 = GetY(i - 1);
                float x1 = i * step;
                float y1 = GetY(i);

                // Midpoint between current and previous point
                float cx = (x0 + x1) / 2;
                float cy = (y0 + y1) / 2;

                // Draw quadratic bezier curve from previous point to midpoint
                path.QuadTo(x0, y0, cx, cy);

                // For last point, connect midpoint to last point
                if (i == Values.Count - 1)
                    path.QuadTo(cx, cy, x1, y1);
            }

            // Stroke line (smooth curve)
            canvas.StrokeColor = Colors.DeepSkyBlue;
            canvas.StrokeSize = 3;
            canvas.DrawPath(path);

            // Build the fill path for gradient below the line
            var fillPath = new PathF(path);
            fillPath.LineTo(width, height);  // down to bottom-right corner
            fillPath.LineTo(0, height);      // bottom-left corner
            fillPath.Close();

            // Create vertical gradient brush (top = solid blue, bottom = transparent)
            var gradient = new LinearGradientBrush(
                new GradientStopCollection
                {
                new GradientStop(Colors.DeepSkyBlue.WithAlpha(0.4f), 0f),
                new GradientStop(Colors.DeepSkyBlue.WithAlpha(0.0f), 1f)
                },
                new Point(0, 0),
                new Point(0, 1));

            // Fill the area under the curve with gradient
            canvas.SetFillPaint(gradient, dirtyRect);
            canvas.FillPath(fillPath);
        }
    }

}
