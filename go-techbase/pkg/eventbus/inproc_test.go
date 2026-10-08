package eventbus

import (
	"context"
	"testing"
)

func TestInprocContract(t *testing.T) {
	runContract(t, NewInproc())
}

func TestInprocPattern(t *testing.T) {
	cases := []struct{ pat, subj string; want bool }{
		{"a.b", "a.b", true},
		{"a.*", "a.b", true},
		{"a.*", "a.b.c", false},
		{"a.>", "a.b.c", true},
		{"a.>", "a", false},
		{"*.done", "x.done", true},
		{"a.b", "a.c", false},
	}
	for _, c := range cases {
		if got := matchPattern(c.pat, c.subj); got != c.want {
			t.Errorf("matchPattern(%q,%q)=%v want %v", c.pat, c.subj, got, c.want)
		}
	}
}

func TestInprocUnsubscribe(t *testing.T) {
	eb := NewInproc()
	sub, _ := eb.Subscribe(t.Context(), "u.k", "d", func(context.Context, Message) error { return nil })
	_ = sub.Unsubscribe()
	_ = sub.Unsubscribe() // 幂等
	if err := eb.Publish(t.Context(), "u.k", nil); err != nil {
		t.Fatalf("publish after unsub: %v", err)
	}
}

func TestNewUnknownDriver(t *testing.T) {
	if _, err := New(Options{Driver: "kafka"}); err == nil {
		t.Fatal("未知 driver 应报错")
	}
}
