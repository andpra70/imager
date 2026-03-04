public class City {

  private int x;
  private int y;

  public City(int x, int y) {
      this.x = x;
      this.y = y;
  }

  // Getters and toString()
}

public class Tour {
  private List<City> cities;
  private int distance;

  public Tour(List<City> cities) {
      this.cities = new ArrayList<>(cities);
      Collections.shuffle(this.cities);
  }
  public City getCity(int index) {
      return cities.get(index);
  }

  public int getTourLength() {
      if (distance != 0) return distance;

      int totalDistance = 0;

      for (int i = 0; i < noCities(); i++) {
          City start = getCity(i);
          City end = getCity(i + 1 < noCities() ? i + 1 : 0);
          totalDistance += Util.distance(start, end);
      }

      distance = totalDistance;
      return totalDistance;
  }

  public Tour duplicate() {
      return new Tour(new ArrayList<>(cities));
  }

  public int noCities() {
      return cities.size();
  }

  // Getters and toString()
}


public class Util {
  public static double probability(double f1, double f2, double temp) {
      if (f2 < f1) return 1;
      return Math.exp((f1 - f2) / temp);
  }

  public static double distance(City city1, City city2) {
      int xDist = Math.abs(city1.getX() - city2.getX());
      int yDist = Math.abs(city1.getY() - city2.getY());
      return Math.sqrt(xDist * xDist + yDist * yDist);
  }
}

public class SimulatedAnnealing {
  private static double temperature = 1000;
  private static double coolingFactor = 0.995;

  public static void main(String[] args) {
      List<City> cities = new ArrayList<>();

      City city1 = new City(100, 100);
      cities.add(city1);

      City city2 = new City(200, 200);
      cities.add(city2);

      City city3 = new City(100, 200);
      cities.add(city3);

      City city4 = new City(200, 100);
      cities.add(city4);

      Tour current = new Tour(cities);
      Tour best = current.duplicate();

      for (double t = temperature; t > 1; t *= coolingFactor) {
          Tour neighbor = current.duplicate();

          int index1 = (int) (neighbor.noCities() * Math.random());
          int index2 = (int) (neighbor.noCities() * Math.random());

          Collections.swap(next.getCities(), index1, index2);

          int currentLength = current.getTourLength();
          int neighborLength = neighbor.getTourLength();

          if (Math.random() < Util.probability(currentLength, neighborLength, t)) {
              current = neighbor.duplicate();
          }

          if (current.getTourLength() < best.getTourLength()) {
              best = current.duplicate();
          }
      }

      System.out.println("Final tour length: " + best.getTourLength());
      System.out.println("Tour: " + best);
  }
}