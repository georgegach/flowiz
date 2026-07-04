"""Typer-based ``flowiz`` CLI: convert, video, info, compare, view."""

from __future__ import annotations

import glob
import sys
from pathlib import Path
from typing import List, Optional

import typer
from rich.console import Console
from rich.progress import Progress
from rich.table import Table

app = typer.Typer(
    add_completion=False,
    help="Optical flow visualization toolkit.",
    no_args_is_help=True,
)
console = Console()
err_console = Console(stderr=True)


def _expand(patterns: List[str]) -> List[str]:
    """Expand globs (for shells that don't) and validate the result."""
    files: List[str] = []
    for p in patterns:
        matched = glob.glob(p)
        files.extend(matched if matched else ([p] if Path(p).exists() else []))
    if not files:
        err_console.print(f"[red]No input files matched:[/red] {' '.join(patterns)}")
        raise typer.Exit(1)
    return files


def _version_callback(value: bool) -> None:
    if value:
        from flowiz import __version__

        console.print(f"flowiz {__version__}")
        raise typer.Exit()


@app.callback()
def _root(
    version: bool = typer.Option(
        False, "--version", callback=_version_callback, is_eager=True,
        help="Show version and exit.",
    ),
) -> None:
    pass


@app.command()
def convert(
    inputs: List[str] = typer.Argument(..., help="Flow files or globs (e.g. 'flows/*.flo')."),
    outdir: Optional[Path] = typer.Option(None, "--outdir", "-o", help="Output directory."),
    mode: str = typer.Option("rgb", "--mode", "-m", help="rgb | uv | mag | angle."),
    workers: int = typer.Option(1, "--workers", "-w", help="Parallel worker processes."),
) -> None:
    """Convert flow files to PNG images."""
    from flowiz.batch import convert_files

    files = _expand(inputs)
    try:
        with Progress(console=console) as progress:
            task = progress.add_task("Converting", total=len(files))
            convert_files(
                files,
                str(outdir) if outdir else None,
                mode=mode,
                workers=workers,
                progress=lambda _dst: progress.advance(task),
            )
    except ValueError as exc:
        err_console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(f"[green]Converted {len(files)} file(s).[/green]")


@app.command()
def video(
    inputs: List[str] = typer.Argument(..., help="Flow files or globs."),
    output: Path = typer.Option(..., "--output", "-o", help="Output video (.mp4/.webm/.gif)."),
    fps: int = typer.Option(24, "--fps", "-r", help="Frames per second."),
    normalize: str = typer.Option("sequence", "--normalize", "-n", help="sequence | frame."),
    max_flow: Optional[float] = typer.Option(None, "--max-flow", help="Fixed normalizer."),
) -> None:
    """Compile flow files into a temporally consistent video."""
    from flowiz.video import write_video

    files = _expand(inputs)
    try:
        with Progress(console=console) as progress:
            task = progress.add_task("Encoding", total=len(files))
            write_video(
                files,
                str(output),
                fps=fps,
                normalize=normalize,
                max_flow=max_flow,
                progress=lambda _i: progress.advance(task),
            )
    except ValueError as exc:
        err_console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc
    console.print(f"[green]Wrote {output}[/green]")


@app.command()
def info(
    file: Path = typer.Argument(..., help="A single flow file."),
) -> None:
    """Print header and statistics for a flow file."""
    import numpy as np

    from flowiz.io import read

    try:
        flow = read(str(file))
    except (ValueError, FileNotFoundError) as exc:
        err_console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc

    mag = flow.magnitude
    invalid = 0 if flow.valid is None else int((~flow.valid).sum())
    table = Table(title=str(file), show_header=False)
    table.add_row("shape", f"{flow.height} x {flow.width}")
    table.add_row("source format", Path(str(file)).suffix or "?")
    table.add_row("u range", f"[{flow.u.min():.3f}, {flow.u.max():.3f}]")
    table.add_row("v range", f"[{flow.v.min():.3f}, {flow.v.max():.3f}]")
    table.add_row("magnitude mean", f"{float(np.mean(mag)):.4f}")
    table.add_row("magnitude max", f"{flow.max_magnitude():.4f}")
    table.add_row("invalid pixels", f"{invalid}")
    console.print(table)


@app.command()
def compare(
    pred: Path = typer.Argument(..., help="Predicted flow."),
    gt: Path = typer.Argument(..., help="Ground-truth flow."),
    save: Optional[Path] = typer.Option(None, "--save", "-s", help="Save comparison grid PNG."),
) -> None:
    """Report EPE / Fl-score between a prediction and ground truth."""
    from flowiz.core.metrics import compare_grid, epe, fl_score
    from flowiz.io import read

    try:
        p, g = read(str(pred)), read(str(gt))
    except (ValueError, FileNotFoundError) as exc:
        err_console.print(f"[red]{exc}[/red]")
        raise typer.Exit(1) from exc

    result = epe(p, g)
    fl = fl_score(p, g)
    table = Table(title=f"{pred.name} vs {gt.name}", show_header=False)
    table.add_row("EPE mean", f"{result.mean:.4f} px")
    table.add_row("EPE median", f"{result.median:.4f} px")
    table.add_row("EPE p90", f"{result.p90:.4f} px")
    table.add_row("Fl-score", f"{fl:.2f} %")
    table.add_row("valid fraction", f"{result.valid_fraction:.3f}")
    console.print(table)

    if save:
        compare_grid(p, g, save=str(save))
        console.print(f"[green]Saved grid to {save}[/green]")


@app.command()
def view(
    port: int = typer.Option(0, "--port", "-p", help="Port (0 = auto)."),
    no_browser: bool = typer.Option(False, "--no-browser", help="Don't open a browser."),
) -> None:
    """Open the bundled offline web viewer in a browser."""
    import http.server
    import socketserver
    import threading
    import webbrowser

    assets = Path(__file__).resolve().parent.parent / "viewer_assets"
    if not (assets / "index.html").exists():
        console.print(
            "[yellow]The bundled viewer is not present in this install.[/yellow]\n"
            "Use the hosted viewer instead: https://georgegach.github.io/flowiz/"
        )
        raise typer.Exit(1)

    handler = lambda *a, **k: http.server.SimpleHTTPRequestHandler(  # noqa: E731
        *a, directory=str(assets), **k
    )
    with socketserver.TCPServer(("127.0.0.1", port), handler) as httpd:
        actual_port = httpd.server_address[1]
        url = f"http://127.0.0.1:{actual_port}/"
        console.print(f"[green]flowiz viewer serving at[/green] {url}  (Ctrl-C to stop)")
        if not no_browser:
            threading.Timer(0.5, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            console.print("\n[dim]Stopped.[/dim]")


def main() -> None:
    """Console-script entry point."""
    try:
        app()
    except Exception as exc:  # pragma: no cover - top-level guard
        err_console.print(f"[red]Internal error:[/red] {exc}")
        sys.exit(2)


if __name__ == "__main__":
    main()
