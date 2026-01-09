using System;
using System.Threading;
using System.Threading.Tasks;

namespace safe.Services
{
    public static class SocketServicePlaceholder
    {
        // Placeholder method. Replace with your TCP/UDP listener.
        // Expected payload format (example): "ANCHOR,Anchor1,23.4,45.2,0,25.7"
        // Or for subjects: "SUBJECT,SubA,120,200,0,Standing,HeartRate:72;Steps:15"
        public static async Task StartSocketListenerPlaceholder(Func<string, double, double, string[], Task> onMessage,
                                                               CancellationToken ct)
        {
            // This just simulates incoming messages every 2s
            await Task.Delay(1000, ct);

            while (!ct.IsCancellationRequested)
            {
                // Simulated messages (you will replace this with actual socket receive & parsing)
                var rnd = new Random();
                double x = rnd.NextDouble() * 300; // simulation coords
                double y = rnd.NextDouble() * 500;

                // Example: call with an id and x,y and extra meta
                await onMessage("Anchor1", x, y, new string[] { "Anchor", "25.9" });
                await onMessage("SubjectA", x + 40, y - 60, new string[] { "Subject", "Standing", "HR:72", "Steps:15" });

                await Task.Delay(2000, ct);
            }
        }
    }
}
