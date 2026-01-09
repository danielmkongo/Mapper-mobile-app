using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace safe.Models
{
    public class Subject : INotifyPropertyChanged
    {
        public string Id { get; set; }
        string label;
        public string Label { get => label; set { label = value; OnPropertyChanged(); } }

        double x;
        public double X { get => x; set { x = value; OnPropertyChanged(); } }

        double y;
        public double Y { get => y; set { y = value; OnPropertyChanged(); } }

        public string Posture { get; set; } // "Standing", "Lying Down"
        public string Vitals { get; set; } // summary string: "Heart Rate: 72 bpm ..."

        public event PropertyChangedEventHandler PropertyChanged;
        void OnPropertyChanged([CallerMemberName] string n = "") => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(n));
    }
}
